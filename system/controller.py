#!/usr/bin/env python3
"""Host-side recovery controller. No Docker socket is exposed to the web app.
Run with fixed, operator-owned arguments. Input files never select commands/paths.
"""
import argparse
import json
import os
import shutil
import http.client
import socket
import re
import time
import uuid
from pathlib import Path


def write(path, value, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp=path.with_name(path.name+'.tmp')
    with open(temp,'w') as f:
        os.chmod(temp,mode)
        json.dump(value,f);f.flush();os.fsync(f.fileno())
    os.replace(temp,path)


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect('/var/run/docker.sock')

def docker(method, name, suffix):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+',name):
        raise ValueError('Invalid operator container name')
    connection=DockerConnection('localhost',timeout=90)
    try:
        connection.request(method,'/containers/'+name+'/'+suffix)
        response=connection.getresponse();body=response.read(1048576)
        if response.status not in (200,204,304):
            raise RuntimeError('Container operation failed')
        return json.loads(body) if body else {}
    finally:connection.close()

class Controller:
    def __init__(self, root, app, notification, gateway, timeout=600):
        self.root=Path(root);self.control=self.root/'control'
        self.containers=[app,notification,gateway];self.timeout=timeout
        self.control.mkdir(parents=True,exist_ok=True)
    def state(self):
        try:return json.loads((self.control/'state.json').read_text())
        except FileNotFoundError:return {'phase':'idle'}
    def restart(self):
        for name in self.containers:docker('POST',name,'restart?t=10')
    def ready(self):
        # Health checks already embedded in the app and companion images.
        for name in self.containers[:2]:
            if docker('GET',name,'json').get('State',{}).get('Health',{}).get('Status')!='healthy':return False
        return True
    def rollback(self, state, reason):
        state.update(phase='rolling_back',reason=reason);write(self.control/'state.json',state)
        for domain in ('app','notification'):
            data=json.loads((self.root/'rollback'/domain).read_text())
            write(self.root/domain/'active.enc',data,0o644 if domain=='notification' else 0o600)
        self.restart()
        state.update(phase='rolled_back');write(self.control/'state.json',state)
        print('System configuration rolled back.',flush=True)
    def tick(self):
        (self.control/'heartbeat').touch(mode=0o600,exist_ok=True)
        state=self.state();now=int(time.time()*1000)
        if state['phase'] in ('applying','rolling_back'):
            self.rollback(state,'Controller recovered an interrupted activation.');return
        if state['phase']=='awaiting_confirmation':
            try:confirmed=json.loads((self.control/'confirmed.json').read_text())
            except FileNotFoundError:confirmed={}
            if now>=state['deadline']:
                self.rollback(state,'A fresh sign-in was not confirmed within the recovery window.');return
            if confirmed.get('revision')==state['revision'] and self.ready():
                state['phase']='confirmed';write(self.control/'state.json',state)
                print('System configuration confirmed.',flush=True);return
            if now-state['started']>120000 and not self.ready():
                self.rollback(state,'The updated services did not become healthy.');return
            return
        request=self.control/'request.json'
        if not request.exists():return
        value=json.loads(request.read_text())
        revision=str(uuid.UUID(value['revision']))
        if revision!=value['revision'] or set(value)!=set(('revision','author','created','app','notification')):raise ValueError('Invalid request')
        for domain in ('app','notification'):
            if value[domain].get('version')!=1:raise ValueError('Invalid encrypted record')
            write(self.root/'rollback'/domain,json.loads((self.root/domain/'active.enc').read_text()))
        state={'phase':'applying','revision':revision,'started':now,'deadline':now+self.timeout*1000}
        write(self.control/'state.json',state)
        request.unlink()
        for domain in ('app','notification'):
            write(self.root/domain/'active.enc',value[domain],0o644 if domain=='notification' else 0o600)
        try:
            self.restart()
            state['phase']='awaiting_confirmation';write(self.control/'state.json',state)
            print('System configuration awaiting fresh sign-in confirmation.',flush=True)
        except Exception:
            self.rollback(state,'The updated services could not restart.')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',required=True);parser.add_argument('--app',required=True)
    parser.add_argument('--notification',required=True);parser.add_argument('--gateway',required=True)
    args=parser.parse_args()
    controller=Controller(args.root,args.app,args.notification,args.gateway)
    import fcntl
    lock=open(controller.control/'controller.lock','w')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    while True:
        try:controller.tick()
        except Exception:print('System configuration controller encountered an error; inspect local configuration.',flush=True)
        time.sleep(3)

if __name__=='__main__':main()
