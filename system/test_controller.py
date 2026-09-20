import json
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from controller import Controller
from database import initialize, Transaction, get, put

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.c=Controller(self.root,'app','notifications','gateway')
        self.c.restart=lambda:None;self.c.ready=lambda:True
        initialize(self.root,{domain:{'version':1,'body':'old-'+domain} for domain in ('app','notification')})
        self.revision=str(uuid.uuid4())
        self.queue({'revision':self.revision,'author':'admin','created':int(time.time()*1000),'app':{'version':1,'body':'new-app'},'notification':{'version':1,'body':'new-notification'}})
    def control(self,key,value):
        with Transaction(self.root) as db: put(db,key,value)
    def queue(self,value):
        with Transaction(self.root) as db: db.execute('INSERT INTO requests VALUES (1,?)',(json.dumps(value),))
    def record(self,domain):
        with Transaction(self.root) as db: return json.loads(db.execute("SELECT envelope FROM "+domain+".records WHERE slot='active'").fetchone()[0])
    def test_transaction_failure_changes_neither_service(self):
        with self.assertRaises(RuntimeError):
            with Transaction(self.root) as db:
                db.execute("UPDATE app.records SET envelope='corrupt' WHERE slot='active'")
                db.execute("UPDATE notification.records SET envelope='corrupt' WHERE slot='active'")
                raise RuntimeError('simulated interruption')
        self.assertEqual(self.record('app')['body'],'old-app')
        self.assertEqual(self.record('notification')['body'],'old-notification')
    def test_killed_writer_recovers_all_databases(self):
        import subprocess, sys
        program="""from database import Transaction,put
import os,sys
with Transaction(sys.argv[1]) as db:
    put(db,'state',{'phase':'damaged'})
    db.execute("UPDATE app.records SET envelope='corrupt'")
    db.execute("UPDATE notification.records SET envelope='corrupt'")
    os._exit(9)
"""
        result=subprocess.run([sys.executable,'-c',program,str(self.root)],cwd=Path(__file__).resolve().parent)
        self.assertEqual(result.returncode,9)
        self.assertEqual(self.record('app')['body'],'old-app')
        self.assertEqual(self.record('notification')['body'],'old-notification')
        self.assertEqual(self.c.state()['phase'],'idle')
    def test_migration_refuses_existing_databases(self):
        with self.assertRaises(RuntimeError):initialize(self.root,{})
        self.assertEqual(self.record('app')['body'],'old-app')
    def test_controller_never_accepts_partial_request(self):
        with Transaction(self.root) as db:
            value=json.loads(db.execute('SELECT value FROM requests').fetchone()[0]);value['notification']['version']=9
            db.execute('UPDATE requests SET value=?',(json.dumps(value),))
        with self.assertRaises(ValueError):self.c.tick()
        self.assertEqual(self.record('app')['body'],'old-app')
        self.assertEqual(self.record('notification')['body'],'old-notification')
    def test_schema_mismatch_fails_closed(self):
        import sqlite3
        with sqlite3.connect(self.root/'app/settings.sqlite') as db:db.execute('PRAGMA user_version=999')
        with self.assertRaises(RuntimeError):self.c.tick()
    def test_unconfirmed_changes_restore_both_services(self):
        self.c.tick();self.assertEqual(self.c.state()['phase'],'awaiting_confirmation')
        state=self.c.state();state['deadline']=0;self.control('state',state)
        self.c.tick();self.assertEqual(self.c.state()['phase'],'rolled_back')
        self.assertEqual(self.record('app')['body'],'old-app')
        self.assertEqual(self.record('notification')['body'],'old-notification')
    def test_confirmed_revision_is_retained(self):
        self.c.tick();self.control('confirmed',{'revision':self.revision})
        self.c.tick();self.assertEqual(self.c.state()['phase'],'confirmed')
        self.assertEqual(self.record('app')['body'],'new-app')
    def test_interrupted_activation_rolls_back(self):
        self.c.tick();state=self.c.state();state['phase']='applying';self.control('state',state)
        self.c.tick();self.assertEqual(self.c.state()['phase'],'rolled_back')
    def test_unhealthy_services_cannot_be_confirmed(self):
        self.c.tick();self.c.ready=lambda:False;state=self.c.state();state['started']-=130000;self.control('state',state)
        self.control('confirmed',{'revision':self.revision});self.c.tick();self.assertEqual(self.c.state()['phase'],'rolled_back')
if __name__=='__main__':unittest.main()
