import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from types import SimpleNamespace

os.environ.setdefault('GATHER_ORIGIN', 'https://dashboard.example.test')
os.environ.setdefault('NTFY_TOPICS', 'apps')

source=Path(os.environ.get('PUSH_SERVER_MODULE',Path(__file__).resolve().parents[1]/'server.py'))
spec=importlib.util.spec_from_file_location('homepage_push',source)
push=importlib.util.module_from_spec(spec);spec.loader.exec_module(push)

def b64(data): return base64.urlsafe_b64encode(data).decode().rstrip('=')

@unittest.skipUnless(importlib.util.find_spec('cryptography') and importlib.util.find_spec('pywebpush'), 'Run these integration tests in the Gather notifications image')
class PushTests(unittest.TestCase):
    def setUp(self):
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        push.DATA=Path(self.tmp.name);push.DB=push.DATA/'push.sqlite3';push.KEY=push.DATA/'vapid.pem';push.initialize()
        self.private=ec.generate_private_key(ec.SECP256R1())
        self.auth=b'0123456789abcdef'
        key=self.private.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
        self.sub={'endpoint':'https://web.push.apple.com/test-subscription','keys':{'auth':b64(self.auth),'p256dh':b64(key)}}
    def api(self,action,owner='account-a',body=None,origin=push.ORIGIN,header='1'):
        handler=push.Handler.__new__(push.Handler);handler.path=push.PREFIX+action
        encoded=json.dumps(self.sub if body is None else body).encode()
        handler.headers={'Origin':origin,'X-Gather-Push':header,'Content-Type':'application/json','Content-Length':str(len(encoded))}
        handler.rfile=io.BytesIO(encoded);responses=[];handler.respond=lambda *args:responses.append(args)
        handler.owner=lambda:owner
        handler.do_POST()
        return responses[-1]
    def test_subscription_ownership_csrf_and_deletion(self):
        self.assertEqual(self.api('subscribe',origin='https://evil.invalid')[0],403)
        self.assertEqual(self.api('subscribe',header='')[0],403)
        self.assertEqual(self.api('subscribe')[0],200)
        self.assertEqual(self.api('status')[1],{'enabled':True})
        self.assertEqual(self.api('subscribe',owner='account-b')[0],409)
        self.assertEqual(self.api('unsubscribe',owner='account-b')[0],409)
        self.assertEqual(self.api('unsubscribe')[0],200)
        self.assertEqual(self.api('status')[1],{'enabled':False})
    def test_reject_private_hosts_and_bad_keys(self):
        for endpoint in ['http://web.push.apple.com/x','https://127.0.0.1/x','https://web.push.apple.com.evil.invalid/x','https://user@web.push.apple.com/x','https://web.push.apple.com:8443/x','https://web.push.apple.com/x#frag']:
            with self.subTest(endpoint=endpoint),self.assertRaises(ValueError):
                push.validate_subscription(dict(self.sub,endpoint=endpoint))
        self.assertEqual(self.api('subscribe',body={'endpoint':self.sub['endpoint'],'keys':{'auth':'a','p256dh':'b'}})[0],400)
    def test_queue_dedup_and_no_history_on_subscribe(self):
        self.api('subscribe');now=time.time()
        messages=[{'event':'message','id':'old','time':now-60,'topic':'apps','message':'old'},
                  {'event':'message','id':'new','time':now,'topic':'apps','message':'new'}]
        push.ingest(messages,now);push.ingest(messages,now)
        with push.connect() as db:
            rows=db.execute('SELECT event FROM queue').fetchall()
            self.assertEqual([r[0] for r in rows],['new'])
        sent=[];push.drain(lambda sub,body:sent.append(json.loads(body)))
        self.assertEqual([m['id'] for m in sent],['new'])
        with push.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM queue').fetchone()[0],0)
    def test_retries_expired_subscriptions_and_test_throttle(self):
        self.api('subscribe');self.assertEqual(self.api('test')[0],200);self.assertEqual(self.api('test')[0],429)
        def temporary(*args):raise RuntimeError('temporary')
        push.drain(temporary)
        with push.connect() as db:
            row=db.execute('SELECT attempts,next_try FROM queue').fetchone();self.assertEqual(row[0],1);self.assertGreater(row[1],time.time())
            db.execute('UPDATE queue SET next_try=0')
        class Gone(Exception):response=SimpleNamespace(status_code=410)
        def gone(*args):raise Gone()
        push.drain(gone)
        self.assertFalse(self.api('status')[1]['enabled'])
        with push.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM queue').fetchone()[0],0)
    def test_session_requires_stable_identity(self):
        with patch.object(push,'urlopen',return_value=io.BytesIO(b'{"user":{"email":"a@example.test"}}')):
            self.assertTrue(push.owner_for_cookie('session=test'))
        with patch.object(push,'urlopen',return_value=io.BytesIO(b'{}')):
            self.assertIsNone(push.owner_for_cookie('session=test'))
        self.assertIsNone(push.owner_for_cookie(''))
    def inbox_get(self, owner='account-a'):
        handler=push.Handler.__new__(push.Handler);handler.path=push.PREFIX+'inbox-state'
        responses=[];handler.respond=lambda *args:responses.append(args)
        handler.owner=lambda:owner
        handler.do_GET()
        return responses[-1]
    def mark(self, updates, owner='account-a', **kwargs):
        return self.api('inbox-state',owner=owner,body={'account':owner,'updates':updates},**kwargs)
    def test_inbox_sync_isolation_and_restart(self):
        self.assertEqual(self.mark({'one':'read'})[0],200)
        self.assertEqual(self.inbox_get()[1]['states'],{'one':'read'})
        self.assertEqual(self.inbox_get('account-b')[1]['states'],{})
        self.assertEqual(self.mark({'two':'dismissed'})[1]['states'],{'one':'read','two':'dismissed'})
        key=push.KEY.read_bytes();push.initialize()
        self.assertEqual(self.inbox_get()[1]['states'],{'one':'read','two':'dismissed'})
        self.assertEqual(key,push.KEY.read_bytes())
    def test_inbox_stale_device_merge_and_concurrent_changes(self):
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda i:self.mark({str(i):'read','shared':'dismissed' if i%2 else 'read'}),range(20)))
        self.assertTrue(all(r[0]==200 for r in results))
        states=self.inbox_get()[1]['states'];self.assertEqual(len(states),21)
        self.assertEqual(states['shared'],'dismissed')
        self.assertEqual(self.mark({'shared':'read'})[1]['states']['shared'],'dismissed')
    def test_inbox_csrf_validation_and_account_guard(self):
        self.assertEqual(self.mark({'one':'read'},origin='https://evil.invalid')[0],403)
        self.assertEqual(self.mark({'one':'read'},header='')[0],403)
        self.assertEqual(self.api('inbox-state',body={'account':'account-b','updates':{'one':'read'}})[0],409)
        for updates in [{'valid':'read','bad':'unknown'}, {'../x':'read'}, {'x'*65:'read'}, {'one':{}}, [], {str(i):'read' for i in range(201)}]:
            with self.subTest(updates=str(updates)[:80]):
                self.assertEqual(self.mark(updates)[0],400)
        self.assertEqual(self.inbox_get()[1]['states'],{})
        self.assertEqual(self.mark({str(i):'read' for i in range(200)})[0],200)
    def test_inbox_missing_session_and_expiry(self):
        handler=push.Handler.__new__(push.Handler);handler.path=push.PREFIX+'inbox-state'
        handler.headers={};responses=[];handler.respond=lambda *args:responses.append(args)
        handler.do_GET();self.assertEqual(responses[-1][0],401)
        self.mark({'one':'read'})
        with push.connect() as db:db.execute('UPDATE inbox_state SET updated=?',(time.time()-32*86400,))
        self.assertEqual(self.inbox_get()[1]['states'],{})
        push.ingest([],time.time())
        with push.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM inbox_state').fetchone()[0],0)
    def test_message_lookup_auth_and_retention(self):
        handler=push.Handler.__new__(push.Handler);handler.path=push.PREFIX+'message/older-id';handler.headers={}
        responses=[];handler.respond=lambda *args:responses.append(args)
        with patch.object(push,'urlopen') as upstream:
            handler.do_GET();self.assertEqual(responses[-1][0],401);upstream.assert_not_called()
        handler.owner=lambda:'account-a'
        message={'event':'message','id':'older-id','topic':'apps','time':1000,'message':'Retained message'}
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push,'urlopen',return_value=io.BytesIO((json.dumps(message)+'\n').encode())):
            handler.do_GET();self.assertEqual(responses[-1][1]['message']['message'],'Retained message')
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push,'urlopen',return_value=io.BytesIO(b'')):
            handler.do_GET();self.assertEqual(responses[-1][0],404)
        handler.path=push.PREFIX+'message/../../bad';handler.do_GET();self.assertEqual(responses[-1][0],400)

    def test_real_webpush_encryption_vapid_and_no_redirect(self):
        import http_ece
        captured=[]
        def request(session,method,url,**kwargs):
            captured.append((url,kwargs))
            return SimpleNamespace(status_code=201,headers={},text='',content=b'')
        with patch('requests.Session.request',request):
            push.deliver(self.sub,json.dumps({'title':'Test','body':'Encrypted notification'}))
        url,kwargs=captured[0]
        self.assertEqual(url,self.sub['endpoint']);self.assertFalse(kwargs['allow_redirects'])
        headers={k.lower():v for k,v in kwargs['headers'].items()}
        self.assertTrue(headers['authorization'].startswith('vapid '))
        decoded=http_ece.decrypt(kwargs['data'],private_key=self.private,auth_secret=self.auth,version='aes128gcm')
        self.assertEqual(json.loads(decoded)['body'],'Encrypted notification')
        self.assertNotIn(b'Encrypted notification',kwargs['data'])

if __name__=='__main__':unittest.main()

class RuntimeSettingsTests(unittest.TestCase):
    def test_runtime_overrides_preserve_server_credentials_and_validate_topics(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'preferences.json'
            with patch.dict(os.environ, {'GATHER_NOTIFICATION_CONFIG': str(target)}):
                self.assertEqual(push.runtime_settings()['topics'], push.TOPICS)
                target.write_text(json.dumps({'topics': 'apps,health', 'appName': 'Example', 'icon': '/images/icon.png'}))
                self.assertEqual(push.runtime_settings()['topics'], 'apps,health')
                self.assertEqual(push.runtime_settings()['appName'], 'Example')
                for invalid in [{'topics': '../private'}, {'icon': '//external.test/x'}, {'token': 'private'}, {'appName': ''}]:
                    target.write_text(json.dumps(invalid))
                    with self.assertRaises(ValueError):
                        push.runtime_settings()
