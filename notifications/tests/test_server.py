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
spec=importlib.util.spec_from_file_location('gather_push',source)
push=importlib.util.module_from_spec(spec);spec.loader.exec_module(push)

def b64(data): return base64.urlsafe_b64encode(data).decode().rstrip('=')

class SubscriptionValidationTests(unittest.TestCase):
    def subscription(self):
        return {'endpoint':'https://web.push.apple.com/test-subscription',
                'keys':{'auth':b64(b'0123456789abcdef'), 'p256dh':b64(b'\x04' + b'x' * 64)}}

    def test_accepts_padded_and_unpadded_keys(self):
        for padded in (False, True):
            value = self.subscription()
            if padded:
                value['keys'] = {k:v + '=' * (-len(v) % 4) for k,v in value['keys'].items()}
            self.assertEqual(push.validate_subscription(value), value)

    def test_rejects_oversized_malformed_and_wrong_length_keys(self):
        for name in ('auth', 'p256dh'):
            for key in ('-' * 8192 + '!', '-' * 89, 'abc', 'a===', None, 123):
                value = self.subscription()
                value['keys'][name] = key
                with self.subTest(name=name, key=str(key)[:30]), self.assertRaises((ValueError, TypeError)):
                    push.validate_subscription(value)

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
        self.read_feed=push.retained_feed
        feed_patch=patch.object(push,'retained_feed',return_value=[])
        self.feed=feed_patch.start();self.addCleanup(feed_patch.stop)
    def api(self,action,owner='account-a',body=None,origin=push.ORIGIN,header='1'):
        handler=push.Handler.__new__(push.Handler);handler.path=push.PREFIX+action
        encoded=json.dumps(self.sub if body is None else body).encode()
        handler.headers={'Origin':origin,'X-Gather-Push':header,'Content-Type':'application/json','Content-Length':str(len(encoded))}
        handler.rfile=io.BytesIO(encoded);responses=[];handler.respond=lambda *args:responses.append(args)
        handler.owner=lambda:owner
        handler.do_POST()
        return responses[-1]
    def get_api(self, action, owner='account-a'):
        handler=push.Handler.__new__(push.Handler);handler.path=push.PREFIX+action
        responses=[];handler.respond=lambda *args:responses.append(args);handler.owner=lambda:owner
        handler.do_GET();return responses[-1]
    def test_device_diagnostics_are_private_and_track_acceptance_and_revocation(self):
        self.api('subscribe')
        ident=push.subscription_id(self.sub)
        self.assertEqual(self.api('device',owner='account-b',body={'account':'account-b','id':ident,'action':'rename','label':'Phone'})[0],404)
        self.assertEqual(self.api('device',body={'account':'account-a','id':ident,'action':'rename','label':'My iPhone'})[0],200)
        self.api('test');push.drain(send=lambda *_:None)
        data=self.get_api('diagnostics')[1]
        self.assertEqual(data['devices'][0]['label'],'My iPhone')
        self.assertIsNotNone(data['devices'][0]['last_sent'])
        self.assertNotIn('endpoint',json.dumps(data));self.assertNotIn('p256dh',json.dumps(data))
        self.assertEqual(self.get_api('diagnostics',owner='account-b')[1]['devices'],[])
        self.api('device',body={'account':'account-a','id':ident,'action':'revoke'})
        self.assertTrue(self.api('status')[1]['revoked'])
        self.api('subscribe');self.assertFalse(self.api('status')[1]['revoked'])
    def test_rules_survive_legacy_preferences_and_only_group_that_account(self):
        self.api('subscribe')
        other={**self.sub,'endpoint':'https://web.push.apple.com/another-device'}
        self.api('subscribe',owner='account-b',body=other)
        rules={'groupSeconds':60,'criticalBypass':False}
        self.assertEqual(self.api('rules',body={'account':'account-a','rules':rules})[0],200)
        self.api('inbox-state',body={'account':'account-a','updates':{},'preferences':{'badge':True,'pushPage':True,'inboxView':'panel'}})
        self.assertEqual(self.get_api('diagnostics')[1]['rules']['groupSeconds'],60)
        now=time.time()
        messages=[{'event':'message','id':str(index),'topic':'apps','title':'Alert','message':'Same signal','time':now} for index in (1,2)]
        push.ingest(messages,now)
        with push.connect() as db:
            a=db.execute('SELECT q.* FROM queue q JOIN subscriptions s ON s.id=q.subscriber WHERE s.owner=?',('account-a',)).fetchall()
            b=db.execute('SELECT q.* FROM queue q JOIN subscriptions s ON s.id=q.subscriber WHERE s.owner=?',('account-b',)).fetchall()
            self.assertEqual(len(a),1);self.assertEqual(json.loads(a[0]['body'])['repeatCount'],2)
            self.assertEqual(a[0]['next_try'],now+60);self.assertEqual(len(b),2)
    def test_muted_alerts_remain_in_retained_inbox_and_unread_count(self):
        self.api('subscribe');self.api('rules',body={'account':'account-a','rules':{'mutedTopics':['apps']}})
        now=time.time()
        with push.connect() as db:db.execute("INSERT OR REPLACE INTO state VALUES ('feed',?)",(json.dumps({'topics':'apps'}),))
        push.ingest([{'event':'message','id':'muted','topic':'apps','time':now}],now)
        with push.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM queue').fetchone()[0],0)
            self.assertEqual(push.unread_badge(db,'account-a',push.cached_feed(db)),1)
    def test_expired_device_has_sanitized_error_and_unknown_badge_is_not_zero(self):
        self.api('subscribe');self.api('test')
        error=RuntimeError('secret endpoint must not be returned');error.response=SimpleNamespace(status_code=410)
        def fail(*_):raise error
        push.drain(send=fail)
        data=self.get_api('diagnostics')[1]
        self.assertEqual(data['devices'][0]['state'],'expired')
        self.assertEqual(data['devices'][0]['last_error'],'HTTP 410')
        self.feed.side_effect=RuntimeError('unavailable')
        self.assertIsNone(self.get_api('diagnostics')[1]['expectedBadge'])

    def test_verified_legacy_email_state_migrates_to_stable_identity(self):
        import hashlib
        email='person@example.test'
        legacy=hashlib.sha256(email.encode()).hexdigest()
        owner=hashlib.sha256(b'stable-subject').hexdigest()
        self.api('subscribe',owner=legacy)
        self.api('inbox-state',owner=legacy,body={'account':legacy,'updates':{'old':'read'}})
        session={'user':{'gatherIdentity':'stable-subject','email':email,'emailVerified':True}}
        with patch.object(push,'urlopen',return_value=io.BytesIO(json.dumps(session).encode())):
            self.assertEqual(push.owner_for_cookie('test'),owner)
        with push.connect() as db:
            self.assertEqual(db.execute('SELECT owner FROM subscriptions').fetchone()[0],owner)
            self.assertEqual(db.execute('SELECT owner FROM inbox_state').fetchone()[0],owner)
        session['user']['gatherIdentity']='another-subject'
        session['user']['emailVerified']=False
        with patch.object(push,'urlopen',return_value=io.BytesIO(json.dumps(session).encode())):
            self.assertNotEqual(push.owner_for_cookie('test'),owner)
        with push.connect() as db:
            self.assertEqual(db.execute('SELECT owner FROM subscriptions').fetchone()[0],owner)

    def test_notification_preferences_are_validated_and_account_scoped(self):
        preferences = {'badge':False,'pushPage':False,'inboxView':'page'}
        body = {'account':'account-a','updates':{},'preferences':preferences}
        self.assertEqual(self.api('inbox-state',body=body)[1]['preferences'], preferences)
        self.assertEqual(self.api('inbox-state',owner='account-b',body=body)[0],409)
        other = self.api('inbox-state',owner='account-b',body={'account':'account-b','updates':{}})
        self.assertEqual(other[1]['preferences'], {'badge':True,'pushPage':True,'inboxView':'panel'})
        self.assertEqual(self.api('inbox-state',body={**body,'preferences':{'badge':'false'}})[0],400)
        self.assertEqual(self.api('inbox-state',body=body,origin='https://evil.invalid')[0],403)
        # Updating read state preserves preferences.
        self.assertEqual(self.api('inbox-state',body={'account':'account-a','updates':{'one':'read'}})[1]['preferences'],preferences)

    def test_subscription_ownership_csrf_and_deletion(self):
        self.assertEqual(self.api('subscribe',origin='https://evil.invalid')[0],403)
        self.assertEqual(self.api('subscribe',header='')[0],403)
        self.assertEqual(self.api('subscribe')[0],200)
        self.assertTrue(self.api('status')[1]['enabled'])
        self.assertEqual(self.api('subscribe',owner='account-b')[0],409)
        self.assertEqual(self.api('unsubscribe',owner='account-b')[0],409)
        self.assertEqual(self.api('unsubscribe')[0],200)
        self.assertFalse(self.api('status')[1]['enabled'])

    def test_push_requests_reject_account_changes_before_mutating(self):
        stale={**self.sub,'account':'account-a'}
        self.assertEqual(self.api('subscribe',owner='account-b',body=stale)[0],409)
        with push.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM subscriptions').fetchone()[0],0)
        self.assertEqual(self.api('subscribe',body=stale)[0],200)
        for action in ('status','test','unsubscribe'):
            with self.subTest(action=action):
                self.assertEqual(self.api(action,owner='account-b',body=stale)[0],409)
        with push.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM subscriptions').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT count(*) FROM queue').fetchone()[0],0)

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
    def test_push_badges_are_account_scoped_and_use_retained_inbox(self):
        self.api('subscribe')
        other={**self.sub,'endpoint':'https://web.push.apple.com/other-subscription'}
        self.api('subscribe',owner='account-b',body=other)
        self.mark({'one':'read','two':'dismissed'})
        self.feed.return_value=[{'id':'one'},{'id':'two'},{'id':'three'}]
        now=time.time()
        push.ingest([{'event':'message','id':'three','time':now,'topic':'apps'}],now)
        sent={}
        push.drain(lambda sub,body:sent.update({sub['endpoint']:json.loads(body)}))
        self.assertEqual(sent[self.sub['endpoint']]['badgeCount'],1)
        self.assertEqual(sent[other['endpoint']]['badgeCount'],3)
        self.assertNotIn('owner',sent[self.sub['endpoint']])
        self.feed.assert_called_once_with('apps')

    def test_retry_badges_use_current_read_state_and_disabled_preference(self):
        self.api('subscribe');self.api('test')
        self.feed.return_value=[{'id':'one'},{'id':'two'}]
        sent=[]
        def temporary(sub,body):
            sent.append(json.loads(body));raise RuntimeError('temporary')
        push.drain(temporary)
        self.assertEqual(sent[-1]['badgeCount'],2)
        self.mark({'one':'read'})
        with push.connect() as db:db.execute('UPDATE queue SET next_try=0')
        push.drain(temporary)
        self.assertEqual(sent[-1]['badgeCount'],1)
        self.mark({'two':'dismissed'})
        with push.connect() as db:db.execute('UPDATE queue SET next_try=0')
        push.drain(temporary)
        self.assertEqual(sent[-1]['badgeCount'],0)
        self.feed.return_value=[{'id':'unread'}]
        self.api('inbox-state',body={'account':'account-a','updates':{},
            'preferences':{'badge':False,'pushPage':True,'inboxView':'panel'}})
        with push.connect() as db:db.execute('UPDATE queue SET next_try=0')
        push.drain(lambda sub,body:sent.append(json.loads(body)))
        self.assertEqual(sent[-1]['badgeCount'],0)
        self.assertTrue(sent[-1]['id'].startswith('test-'))

    def test_badge_clear_and_feed_failure_do_not_lose_notifications(self):
        self.api('subscribe');self.api('test')
        self.feed.side_effect=RuntimeError('ntfy unavailable')
        sent=[]
        push.drain(lambda sub,body:sent.append(json.loads(body)))
        self.assertNotIn('badgeCount',sent[-1])
        self.feed.side_effect=None
        with push.connect() as db:db.execute('UPDATE subscriptions SET last_test=0')
        self.api('test')
        push.drain(lambda sub,body:sent.append(json.loads(body)))
        self.assertEqual(sent[-1]['badgeCount'],0)
        self.feed.reset_mock()
        push.drain()
        self.feed.assert_not_called()

    def test_delivery_rechecks_subscription_after_fetching_badge_feed(self):
        self.api('subscribe');self.api('test')
        def unsubscribe(topics):
            self.api('unsubscribe');return []
        self.feed.side_effect=unsubscribe
        sent=[]
        push.drain(lambda *args:sent.append(args))
        self.assertEqual(sent,[])
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
            push.deliver(self.sub,json.dumps({'title':'Test','body':'Encrypted notification','badgeCount':7}))
        url,kwargs=captured[0]
        self.assertEqual(url,self.sub['endpoint']);self.assertFalse(kwargs['allow_redirects'])
        headers={k.lower():v for k,v in kwargs['headers'].items()}
        self.assertTrue(headers['authorization'].startswith('vapid '))
        decoded=http_ece.decrypt(kwargs['data'],private_key=self.private,auth_secret=self.auth,version='aes128gcm')
        self.assertEqual(json.loads(decoded)['body'],'Encrypted notification')
        self.assertEqual(json.loads(decoded)['badgeCount'],7)
        self.assertNotIn(b'Encrypted notification',kwargs['data'])

    def test_retained_inbox_to_encrypted_push_badge_without_browser_session(self):
        import http_ece
        self.api('subscribe');self.mark({'read':'read'})
        now=time.time()
        message={'event':'message','id':'unread','topic':'apps','time':now,'message':'Background alert'}
        push.ingest([message],now)
        history=[{**message,'id':'read'},message]
        self.feed.side_effect=self.read_feed
        captured=[]
        def request(session,method,url,**kwargs):
            captured.append(kwargs['data'])
            return SimpleNamespace(status_code=201,headers={},text='',content=b'')
        response=io.BytesIO(''.join(json.dumps(item)+'\n' for item in history).encode())
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push,'urlopen',side_effect=lambda *a,**kw:io.BytesIO(''.join(json.dumps(item)+'\n' for item in history).encode())),patch.object(push,'owner_for_cookie',side_effect=AssertionError('No browser session required')),patch('requests.Session.request',request):
            push.drain(push.deliver)
        self.assertEqual(len(captured),1)
        body=json.loads(http_ece.decrypt(captured[0],private_key=self.private,auth_secret=self.auth,version='aes128gcm'))
        self.assertEqual(body,{'id':'unread','title':'apps','body':'Background alert','topic':'apps','priority':3,'badgeCount':1})
        with push.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM queue').fetchone()[0],0)


@unittest.skipUnless(importlib.util.find_spec('cryptography'), 'Run in the Gather notifications image')
class RetainedFeedTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        for name,value in [('DATA',Path(self.tmp.name)),('DB',Path(self.tmp.name)/'push.sqlite3'),('KEY',Path(self.tmp.name)/'vapid.pem')]:
            replacement=patch.object(push,name,value);replacement.start();self.addCleanup(replacement.stop)
        push.initialize()

    def message(self, ident, **changes):
        return {'event':'message','id':ident,'topic':'apps','time':time.time(), **changes}

    def response(self, messages):
        return io.BytesIO(''.join(json.dumps(item)+'\n' for item in messages).encode())

    def upstream(self, messages):
        return patch.object(push,'urlopen',side_effect=lambda *a,**kw:self.response(messages))

    def test_partial_replay_with_inline_ntfy_error_is_not_a_valid_empty_inbox(self):
        # ntfy can exhaust its replay bandwidth after HTTP 200 and append an
        # error to an otherwise valid NDJSON stream. Old, already-read messages
        # before that error must never become an authoritative zero badge.
        items=[{'event':'message','id':'old-read','topic':'apps','time':1},
               {'code':42905,'error':'daily bandwidth limit reached'}]
        response=io.BytesIO(''.join(json.dumps(item)+'\n' for item in items).encode())
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push,'urlopen',return_value=response):
            with self.assertRaises(RuntimeError):
                push.retained_feed('apps')
        with push.connect() as db:
            self.assertIsNone(db.execute("SELECT value FROM state WHERE key='feed'").fetchone())

    def test_readers_share_history_and_restart_preserves_the_inbox(self):
        from concurrent.futures import ThreadPoolExecutor
        messages=[self.message(str(i),time=time.time()-300+i) for i in range(205)]
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),self.upstream(messages) as upstream:
            with ThreadPoolExecutor(max_workers=8) as pool:
                results=list(pool.map(lambda _:push.retained_feed('apps'),range(16)))
            self.assertTrue(all(len(feed)==200 for feed in results))
            upstream.assert_called_once()
            push.initialize()
            self.assertEqual(push.retained_feed('apps'),results[0])
            upstream.assert_called_once()

    def test_new_alert_is_in_the_badge_before_delivery_without_another_replay(self):
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),self.upstream([self.message('read')]) as upstream:
            push.retained_feed('apps')
            requests=upstream.call_count
            now=time.time()
            push.ingest([self.message('new',time=now)],now)
            with push.connect() as db:
                db.execute('INSERT INTO inbox_state VALUES (?,?,?,?)',('account','read','read',now))
            feed=push.retained_feed('apps')
            with push.connect() as db:
                self.assertEqual(push.unread_badge(db,'account',feed),1)
            self.assertEqual({m['id'] for m in feed},{'read','new'})
            self.assertEqual(upstream.call_count,requests)

    def test_refresh_uses_cursor_and_partial_failure_preserves_last_complete_history(self):
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),self.upstream([self.message('previous')]):
            original=push.retained_feed('apps')
        with push.connect() as db:
            saved=json.loads(db.execute("SELECT value FROM state WHERE key='feed'").fetchone()[0])
        broken=[self.message('partial'),{'code':42905,'error':'limit reached'}]
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push.time,'time',return_value=saved['checked']+31),self.upstream(broken) as upstream:
            with self.assertRaises(RuntimeError):push.retained_feed('apps')
            self.assertTrue(upstream.call_args.args[0].full_url.endswith('since=previous'))
        with push.connect() as db:
            self.assertEqual(push.cached_feed(db),original)
            self.assertEqual(json.loads(db.execute("SELECT value FROM state WHERE key='feed'").fetchone()[0]),saved)
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push.time,'time',return_value=saved['checked']+92),self.upstream([self.message('next')]) as upstream:
            self.assertEqual({m['id'] for m in push.retained_feed('apps')},{'previous','next'})
            self.assertTrue(upstream.call_args.args[0].full_url.endswith('since=previous'))

    def test_reconciliation_removes_deleted_messages_and_does_not_replay_the_month(self):
        now=time.time()
        messages=[self.message(str(i),time=now-300+i) for i in range(205)]
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),self.upstream(messages):push.retained_feed('apps')
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push.time,'time',return_value=now+301),self.upstream(messages[:-1]) as upstream:
            feed=push.retained_feed('apps')
            self.assertNotIn('204',[m['id'] for m in feed])
            self.assertNotIn('since=720h',upstream.call_args.args[0].full_url)

    def test_topic_changes_cannot_serve_history_from_the_previous_configuration(self):
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),self.upstream([self.message('apps-only')]):push.retained_feed('apps')
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),self.upstream([{'code':42905,'error':'limit reached'}]):
            with self.assertRaises(RuntimeError):push.retained_feed('health')
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push.time,'time',return_value=time.time()+61),self.upstream([self.message('health-only',topic='health')]):
            self.assertEqual([m['id'] for m in push.retained_feed('health')],['health-only'])

    def test_failed_bootstrap_backs_off_across_readers_and_restart(self):
        errors=[{'code':42905,'error':'limit reached'}]
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),self.upstream(errors) as upstream:
            for _ in range(10):
                with self.assertRaises(RuntimeError):push.retained_feed('apps')
            push.initialize()
            with self.assertRaises(RuntimeError):push.retained_feed('apps')
            upstream.assert_called_once()
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push.time,'time',return_value=time.time()+61),self.upstream([self.message('recovered')]):
            self.assertEqual([m['id'] for m in push.retained_feed('apps')],['recovered'])

    def test_expired_messages_disappear_and_empty_inboxes_are_cached(self):
        now=time.time()
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),self.upstream([self.message('short-lived',expires=now+5)]) as upstream:
            self.assertEqual(len(push.retained_feed('apps')),1)
            with patch.object(push.time,'time',return_value=now+6):self.assertEqual(push.retained_feed('apps'),[])
            requests=upstream.call_count
            push.retained_feed('apps');self.assertEqual(upstream.call_count,requests)

    def test_poll_rejects_inline_errors_without_advancing_cursor_or_queuing_partial_alerts(self):
        with push.connect() as db:cursor=db.execute("SELECT value FROM state WHERE key='cursor'").fetchone()[0]
        items=[self.message('partial'),{'code':42905,'error':'limit reached'}]
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),self.upstream(items):
            with self.assertRaises(RuntimeError):push.poll()
        with push.connect() as db:
            self.assertEqual(db.execute("SELECT value FROM state WHERE key='cursor'").fetchone()[0],cursor)
            self.assertEqual(db.execute('SELECT count(*) FROM events').fetchone()[0],0)

    def test_retained_feed_matches_latest_200_inbox_messages_and_filters_topics(self):
        messages=[{'event':'message','id':str(i),'topic':'apps','time':time.time()-300+i,'message':'Example'} for i in range(205)]
        messages.extend([{'event':'keepalive','id':'keep','topic':'apps'},
                         {'event':'message','id':'private','topic':'another'}])
        response=io.BytesIO(''.join(json.dumps(item)+'\n' for item in messages).encode())
        with patch.dict(os.environ,{'NTFY_AUTH':'Bearer test'}),patch.object(push,'urlopen',return_value=response) as upstream:
            feed=push.retained_feed('apps')
        self.assertEqual([item['id'] for item in feed],list(map(str,range(204,4,-1))))
        self.assertNotIn('event',feed[0])
        request=upstream.call_args.args[0]
        self.assertEqual(request.get_header('Authorization'),'Bearer test')
        self.assertTrue(request.full_url.endswith('/apps/json?poll=1&since=1h'))

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

if __name__=='__main__':unittest.main()
