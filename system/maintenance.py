"""Fixed Docker maintenance operations for complete Gather snapshots.
The web app can queue an operation, never a command, mount, image or container name.
"""
import json
import os
import re
import time
from pathlib import Path

TERMINAL = ('complete', 'confirmed', 'rolled_back', 'failed')

def write(file, value):
    temp = file.with_suffix('.tmp')
    with temp.open('w') as output:
        os.chmod(temp, 0o600)
        json.dump(value, output)
        output.flush(); os.fsync(output.fileno())
    os.replace(temp, file)
    descriptor=os.open(file.parent,os.O_RDONLY)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)

def load(root):
    directory = Path(root)/'control/maintenance'
    pointer = directory/'active.json'
    if not pointer.exists(): return None
    ident = json.loads(pointer.read_text()).get('id', '')
    if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', ident):
        raise ValueError('Invalid maintenance identifier')
    file = directory/'jobs'/ident/'job.json'
    job = json.loads(file.read_text())
    if job['id'] != ident: raise ValueError('Invalid maintenance request')
    return file, job

class Maintenance:
    def __init__(self, controller, api):
        self.controller = controller
        self.api = api
    def plan(self, file):
        c = self.controller
        app, notification = [self.api('GET', '/containers/'+name+'/json') for name in c.containers[:2]]
        def mount(container, destination):
            found = [entry for entry in container.get('Mounts', []) if entry.get('Destination') == destination]
            if len(found) != 1 or found[0].get('Type') not in ('bind', 'volume'):
                raise RuntimeError('Complete backups require the standard persistent mounts')
            source = found[0]['Source']
            if not isinstance(source, str) or not source.startswith('/') or source == '/' or ':' in source or '\n' in source:
                raise RuntimeError('Unsupported mount')
            return source
        state = mount(app, '/system-data')
        config = mount(app, '/app/config')
        if mount(notification, '/vault') != state+'/notification' or mount(notification, '/config') not in (config,config+'/.gather-runtime'):
            raise RuntimeError('Notification vault or configuration mounts disagree')
        for container, protected in ((app, ('/system-data','/app/config')), (notification, ('/data',))):
            if any(entry.get('Destination','').startswith(root+'/') for entry in container.get('Mounts',[]) for root in protected):
                raise RuntimeError('Nested persistent mounts require an operator-managed backup')
        sources = [(config, '/source/config'), (state, '/source/system'),
                   (mount(notification, '/data'), '/source/push'),
                   (mount(app, '/run/secrets/gather-app-key'), '/source/keys/app.key'),
                   (mount(app, '/run/secrets/gather-notification-key'), '/source/keys/notification.key'),
                   (state+'/control/maintenance/jobs/'+file.parent.name, '/maintenance/job'),
                   (state+'/control/maintenance/transport.key', '/maintenance/transport.key')]
        if mount(notification, '/run/secrets/gather-notification-key') != sources[4][0]:
            raise RuntimeError('Notification key mounts disagree')
        image = app['Image']
        if not re.fullmatch(r'sha256:[a-f0-9]{64}', image): raise RuntimeError('Invalid installed image')
        user = app.get('Config', {}).get('User', '')
        environment = dict(entry.split('=',1) for entry in app.get('Config',{}).get('Env',[]) if isinstance(entry,str) and '=' in entry)
        drops_privileges = user in ('', 'root', '0', '0:0') and environment.get('PUID') == '1001' and environment.get('PGID') == '1001'
        if user not in ('1001:1001', '1001') and not drops_privileges:
            raise RuntimeError('Complete backups require the supported UID 1001 installation')
        return {'Image': image, 'User': '1001:1001', 'WorkingDir': '/app',
                'Entrypoint': ['node', '/app/system/full-backup.cjs'], 'Env': ['NODE_ENV=production'],
                'HostConfig': {'Binds': [source+':'+target+(':ro' if target.endswith('transport.key') else ':rw') for source,target in sources],
                               'NetworkMode': 'none', 'ReadonlyRootfs': True, 'CapDrop': ['ALL'],
                               'Tmpfs': {'/tmp': 'rw,nosuid,nodev,noexec,size=536870912,mode=1777'},
                               'SecurityOpt': ['no-new-privileges:true'], 'Memory': 1073741824, 'PidsLimit': 64,
                               'LogConfig': {'Type': 'none'}},
                'Labels': {'io.gather.maintenance': file.parent.name}}
    def helper(self, file, job, action):
        spec = self.plan(file); spec['Cmd'] = [action]
        ident = self.api('POST', '/containers/create', spec)['Id']
        job['helper'] = ident; write(file, job)
        try:
            self.api('POST', '/containers/'+ident+'/start')
            result = self.api('POST', '/containers/'+ident+'/wait?condition=not-running')
            if result.get('StatusCode') != 0: raise RuntimeError('Maintenance helper failed')
        finally:
            self.api('DELETE', '/containers/'+ident+'?force=1')
            job.pop('helper', None); write(file, job)
    def stop(self, job):
        for name in job.get('running', []): self.api('POST', '/containers/'+name+'/stop?t=15')
    def start(self, job):
        for name in job.get('running', []): self.api('POST', '/containers/'+name+'/start')
    def cleanup(self, file, job):
        # Keep the encrypted rollback and result; never retain decrypted staging after a crash.
        import shutil
        for entry in file.parent.glob('stage-*'):
            if entry.is_dir(): shutil.rmtree(entry)
            else: entry.unlink(missing_ok=True)
        job.pop('secret', None)
    def rollback(self, file, job):
        job['phase'] = 'rolling_back'; write(file, job)
        self.stop(job)
        self.helper(file, job, 'rollback')
        self.start(job)
        job['phase'] = 'rolled_back'; job['message'] = 'The previous Gather state was restored.'
        self.cleanup(file, job); write(file, job)
    def tick(self):
        loaded = load(self.controller.root)
        if not loaded: return False
        file, job = loaded; phase = job['phase']; now = int(time.time()*1000)
        if phase in TERMINAL: return False
        if phase == 'validated':
            if now-job['created'] > 86400000:
                job.update(phase='failed', message='Restore inspection expired. Upload the backup again.')
                self.cleanup(file, job); write(file, job)
            return True
        if phase == 'awaiting_confirmation':
            if job.get('confirmed') and self.controller.ready():
                job.update(phase='confirmed', message='Restore confirmed after a fresh sign-in.')
                self.cleanup(file, job); write(file, job)
            elif now >= job['deadline'] or (now-job.get('activated',job['started']) > 120000 and not self.controller.ready()):
                self.rollback(file, job)
            return True
        if phase in ('applying', 'rolling_back', 'backing_up', 'inspecting'):
            if job.get('helper'):
                self.api('DELETE', '/containers/'+job['helper']+'?force=1'); job.pop('helper', None)
            if (file.parent/'restore-started.json').exists(): self.rollback(file, job)
            else:
                self.start(job); job.update(phase='failed', message='An interrupted operation was cancelled; live data was not replaced.')
                self.cleanup(file, job); write(file, job)
            return True
        if phase not in ('queued', 'restore_queued'): raise ValueError('Invalid maintenance phase')
        action = 'restore' if phase == 'restore_queued' else job['action']
        if action not in ('backup', 'inspect', 'restore'): raise ValueError('Invalid maintenance action')
        try:
            self.plan(file)  # Check fixed mounts/image before stopping anything.
            job['running'] = [name for name in self.controller.containers[:2] if self.api('GET', '/containers/'+name+'/json').get('State', {}).get('Running')]
            if len(job['running']) != 2: raise RuntimeError('Both Gather services must be running')
        except Exception:
            job.update(phase='failed',message='Maintenance requires compatible component images, persistent mounts and both services running.')
            self.cleanup(file,job);write(file,job);return True
        job.update(phase={'backup': 'backing_up', 'inspect': 'inspecting', 'restore': 'applying'}[action], started=now)
        write(file, job)
        try:
            if action != 'inspect': self.stop(job)
            self.helper(file, job, action)
            if action != 'inspect': self.start(job)
            job.update(phase={'backup': 'complete', 'inspect': 'validated', 'restore': 'awaiting_confirmation'}[action],
                       message={'backup': 'Encrypted backup ready to download.', 'inspect': 'Backup validated. Review before restoring.',
                                'restore': 'Sign in again and confirm the restored installation within ten minutes.'}[action])
            if action == 'restore':
                job['activated'] = int(time.time()*1000)
                job['deadline'] = job['activated']+600000
            if action == 'backup': self.cleanup(file, job)
            write(file, job)
        except Exception:
            if (file.parent/'restore-started.json').exists(): self.rollback(file, job)
            else:
                if action != 'inspect': self.start(job)
                job.update(phase='failed', message='Backup validation or storage operation failed. Live data was not replaced.')
                self.cleanup(file, job); write(file, job)
        return True
