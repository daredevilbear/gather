import json
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from controller import Controller, write

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.c=Controller(self.root,'app','notifications','gateway')
        self.c.restart=lambda:None;self.c.ready=lambda:True
        for domain in ('app','notification'):write(self.root/domain/'active.enc',{'version':1,'body':'old-'+domain})
        self.revision=str(uuid.uuid4())
        write(self.root/'control/request.json',{'revision':self.revision,'author':'admin','created':int(time.time()*1000),'app':{'version':1,'body':'new-app'},'notification':{'version':1,'body':'new-notification'}})
    def test_unconfirmed_changes_restore_both_services(self):
        self.c.tick();self.assertEqual(self.c.state()['phase'],'awaiting_confirmation')
        state=self.c.state();state['deadline']=0;write(self.root/'control/state.json',state)
        self.c.tick();self.assertEqual(self.c.state()['phase'],'rolled_back')
        self.assertEqual(json.loads((self.root/'app/active.enc').read_text())['body'],'old-app')
        self.assertEqual(json.loads((self.root/'notification/active.enc').read_text())['body'],'old-notification')
    def test_confirmed_revision_is_retained(self):
        self.c.tick();write(self.root/'control/confirmed.json',{'revision':self.revision})
        self.c.tick();self.assertEqual(self.c.state()['phase'],'confirmed')
        self.assertEqual(json.loads((self.root/'app/active.enc').read_text())['body'],'new-app')
    def test_interrupted_activation_rolls_back(self):
        self.c.tick();state=self.c.state();state['phase']='applying';write(self.root/'control/state.json',state)
        self.c.tick();self.assertEqual(self.c.state()['phase'],'rolled_back')
    def test_unhealthy_services_cannot_be_confirmed(self):
        self.c.tick();self.c.ready=lambda:False;state=self.c.state();state['started']-=130000;write(self.root/'control/state.json',state)
        write(self.root/'control/confirmed.json',{'revision':self.revision});self.c.tick();self.assertEqual(self.c.state()['phase'],'rolled_back')
if __name__=='__main__':unittest.main()
