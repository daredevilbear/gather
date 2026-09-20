#!/usr/bin/env python3
"""Host-side recovery controller. No Docker socket is exposed to the web app.
Run with fixed, operator-owned arguments. Input files never select commands/paths.
"""
import argparse
import json
import os
import http.client
import socket
import re
import time
import uuid
from pathlib import Path
from database import Transaction, get, put, event


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
        with Transaction(self.root) as db: return get(db,'state',{'phase':'idle'})
    def restart(self):
        for name in self.containers:docker('POST',name,'restart?t=10')
    def ready(self):
        # Health checks already embedded in the app and companion images.
        for name in self.containers[:2]:
            if docker('GET',name,'json').get('State',{}).get('Health',{}).get('Status')!='healthy':return False
        return True
    def rollback(self, state, reason):
        with Transaction(self.root) as db:
            state.update(phase='rolling_back',reason=reason)
            for domain in ('app','notification'):
                row=db.execute('SELECT envelope FROM '+domain+'.records WHERE slot=?',('rollback',)).fetchone()
                if row is None: raise RuntimeError('Missing rollback record')
                db.execute('UPDATE '+domain+'.records SET envelope=? WHERE slot=?',(row[0],'active'))
            put(db,'state',state)
            event(db,'rollback_started',state['revision'])
        self.restart()
        with Transaction(self.root) as db:
            state.update(phase='rolled_back');put(db,'state',state)
            event(db,'rolled_back',state['revision'])
        print('System configuration rolled back.',flush=True)
    def tick(self):
        now=int(time.time()*1000)
        with Transaction(self.root) as db: put(db,'heartbeat',now)
        state=self.state()
        if state['phase'] in ('applying','rolling_back'):
            self.rollback(state,'Controller recovered an interrupted activation.');return
        if state['phase']=='awaiting_confirmation':
            with Transaction(self.root) as db: confirmed=get(db,'confirmed',{})
            if now>=state['deadline']:
                self.rollback(state,'A fresh sign-in was not confirmed within the recovery window.');return
            if confirmed.get('revision')==state['revision'] and self.ready():
                with Transaction(self.root) as db:
                    state['phase']='confirmed';put(db,'state',state)
                    event(db,'confirmed',state['revision'])
                print('System configuration confirmed.',flush=True);return
            if now-state['started']>120000 and not self.ready():
                self.rollback(state,'The updated services did not become healthy.');return
            return
        with Transaction(self.root) as db:
            row=db.execute('SELECT value FROM requests WHERE id=1').fetchone()
            if row is None:return
            value=json.loads(row[0])
            revision=str(uuid.UUID(value['revision']))
            if revision!=value['revision'] or set(value)!=set(('revision','author','created','app','notification')):raise ValueError('Invalid request')
            for domain in ('app','notification'):
                if value[domain].get('version')!=1:raise ValueError('Invalid encrypted record')
                db.execute('INSERT INTO '+domain+'.records SELECT ?,envelope FROM '+domain+'.records WHERE slot=? ON CONFLICT(slot) DO UPDATE SET envelope=excluded.envelope',('rollback','active'))
                db.execute('UPDATE '+domain+'.records SET envelope=? WHERE slot=?',(json.dumps(value[domain]),'active'))
            state={'phase':'applying','revision':revision,'started':now,'deadline':now+self.timeout*1000}
            put(db,'state',state);put(db,'confirmed',{})
            db.execute('DELETE FROM requests WHERE id=1')
            event(db,'activation_started',revision)
        try:
            self.restart()
            with Transaction(self.root) as db:
                state['phase']='awaiting_confirmation';put(db,'state',state)
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
