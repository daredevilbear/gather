import json
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from maintenance import Maintenance, load, write

class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.id=str(uuid.uuid4());self.folder=self.root/'control/maintenance/jobs'/self.id
        self.folder.mkdir(parents=True);self.file=self.folder/'job.json'
        write(self.root/'control/maintenance/active.json',{'id':self.id})
        self.job={'id':self.id,'action':'backup','phase':'queued','owner':'admin','created':int(time.time()*1000),'secret':{'encrypted':True}}
        self.controller=SimpleNamespace(root=self.root,containers=['app','notification','gateway'],ready=lambda:True)
        self.calls=[]
        self.api=lambda method,target,data=None:self.api_call(method,target,data)
        self.maintenance=Maintenance(self.controller,self.api)
    def api_call(self,method,target,data):
        self.calls.append((method,target,data))
        if target.endswith('/json'):return {'State':{'Running':True}}
        return {}
    def save(self):write(self.file,self.job)
    def read(self):return json.loads(self.file.read_text())
    def test_bad_mount_plan_fails_before_stopping_services(self):
        self.save();self.maintenance.tick()
        self.assertEqual(self.read()['phase'],'failed')
        self.assertFalse(any('/stop' in target for _,target,_ in self.calls))
    def test_snapshot_stops_both_writers_and_restarts_after_helper_success(self):
        self.save();self.maintenance.plan=Mock(return_value={});self.maintenance.helper=Mock()
        self.maintenance.tick();saved=self.read()
        self.assertEqual(saved['phase'],'complete');self.assertNotIn('secret',saved)
        self.assertEqual([target for _,target,_ in self.calls if '/stop' in target],['/containers/app/stop?t=15','/containers/notification/stop?t=15'])
        self.assertEqual([target for _,target,_ in self.calls if target.endswith('/start')],['/containers/app/start','/containers/notification/start'])
    def test_inspection_does_not_stop_or_restart_live_services(self):
        self.job['action']='inspect';self.save();self.maintenance.plan=Mock(return_value={});self.maintenance.helper=Mock()
        self.maintenance.tick();self.assertEqual(self.read()['phase'],'validated')
        self.assertFalse(any('/stop' in target or '/start' in target for _,target,_ in self.calls))
    def test_interrupted_restore_rolls_back_before_restarting(self):
        self.job.update(phase='applying',running=['app','notification']);self.save()
        write(self.folder/'restore-started.json',{'started':0})
        actions=[];self.maintenance.helper=lambda file,job,action:actions.append(action)
        self.maintenance.tick();self.assertEqual(actions,['rollback']);self.assertEqual(self.read()['phase'],'rolled_back')
    def test_unconfirmed_or_unhealthy_restore_rolls_back_and_fresh_confirmation_completes(self):
        self.job.update(phase='awaiting_confirmation',running=['app','notification'],started=0,deadline=0);self.save()
        self.maintenance.helper=Mock();self.maintenance.tick();self.assertEqual(self.read()['phase'],'rolled_back')
        self.job.update(phase='awaiting_confirmation',started=int(time.time()*1000),deadline=int(time.time()*1000)+600000,confirmed=True);self.save()
        self.maintenance.tick();self.assertEqual(self.read()['phase'],'confirmed')
    def test_helper_uses_exact_installed_image_and_fixed_isolated_mounts(self):
        def inspect(method,target,data=None):
            mounts=[{'Type':'bind','Source':'/srv/gather/'+name,'Destination':dest} for name,dest in [
                ('config','/app/config'),('config','/config'),('system','/system-data'),('system/notification','/vault'),('push','/data'),
                ('app.key','/run/secrets/gather-app-key'),('notification.key','/run/secrets/gather-notification-key')]]
            return {'Image':'sha256:'+'a'*64,'Config':{'User':'1001:1001'},'Mounts':mounts}
        self.maintenance.api=inspect;spec=self.maintenance.plan(self.file)
        self.assertEqual(spec['Image'],'sha256:'+'a'*64)
        self.assertEqual(spec['HostConfig']['NetworkMode'],'none')
        self.assertIn('noexec',spec['HostConfig']['Tmpfs']['/tmp'])
        self.assertTrue(spec['HostConfig']['ReadonlyRootfs']);self.assertEqual(spec['HostConfig']['CapDrop'],['ALL'])
        self.assertFalse(any('docker.sock' in mount for mount in spec['HostConfig']['Binds']))
        self.assertEqual(spec['Entrypoint'],['node','/app/system/full-backup.cjs'])
    def test_pointer_cannot_select_an_arbitrary_path(self):
        write(self.root/'control/maintenance/active.json',{'id':'../../outside'})
        with self.assertRaises(ValueError):load(self.root)

    def test_mismatched_notification_vault_is_rejected_before_stopping(self):
        def inspect(method,target,data=None):
            mounts=[{'Type':'bind','Source':'/srv/gather/'+name,'Destination':dest} for name,dest in [
                ('config','/app/config'),('config','/config'),('system','/system-data'),('wrong-vault','/vault')]]
            return {'Image':'sha256:'+'a'*64,'Config':{'User':'1001:1001'},'Mounts':mounts}
        self.maintenance.api=inspect
        with self.assertRaisesRegex(RuntimeError,'mounts disagree'):self.maintenance.plan(self.file)

    def test_existing_entrypoint_uid_and_generated_config_mount_are_supported(self):
        def inspect(method,target,data=None):
            notification = target == '/containers/notification/json'
            mounts=[{'Type':'bind','Source':'/srv/gather/'+name,'Destination':dest} for name,dest in [
                ('config','/app/config'),('config/.gather-runtime' if notification else 'config','/config'),
                ('system','/system-data'),('system/notification','/vault'),('push','/data'),
                ('app.key','/run/secrets/gather-app-key'),('notification.key','/run/secrets/gather-notification-key')]]
            return {'Image':'sha256:'+'a'*64,'Config':{'User':'root','Env':['PUID=1001','PGID=1001']},'Mounts':mounts}
        self.maintenance.api=inspect
        self.assertEqual(self.maintenance.plan(self.file)['User'],'1001:1001')
