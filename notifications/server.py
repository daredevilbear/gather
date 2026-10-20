"""Authenticated Gather Web Push. ntfy and browser credentials remain private."""
import base64
import hashlib
import json
import os
import re
import sqlite3
import threading
import time
import uuid
from collections import deque
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from alert_rules import DEFAULT_RULES, validate_rules, allowed, critical
from vault_loader import load as load_vault
load_vault()

ORIGIN = os.environ['GATHER_ORIGIN'].rstrip('/')
SESSION_URL = os.environ.get('SESSION_URL', 'http://gather:3000/api/auth/session')
NTFY_URL = os.environ.get('NTFY_URL', 'http://ntfy:8080').rstrip('/')
APP_NAME = os.environ.get('APP_NAME', 'Gather')
ICON_URL = os.environ.get('ICON_URL', '/android-chrome-512x512.png')
PREFIX = '/gather-notifications/'
TOPICS = os.environ.get('NTFY_TOPICS', 'gather')
if not re.fullmatch(r'[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*', TOPICS):
    raise ValueError('Invalid NTFY_TOPICS')
DATA = Path(os.environ.get('PUSH_DATA', '/data'))
DB = DATA / 'push.sqlite3'
KEY = DATA / 'vapid.pem'
public_key = ''
last_poll = 0
feed_lock = threading.RLock()
MESSAGE_FIELDS = ('id','time','topic','title','message','priority','tags','click')

def runtime_settings():
    """Only non-secret preferences can be overridden by the dashboard editor."""
    target = Path(os.environ.get('GATHER_NOTIFICATION_CONFIG', '/config/gather-notifications.json'))
    try:
        if target.stat().st_size > 16384:
            raise ValueError('Notification preferences too large')
        value = json.loads(target.read_text())
    except FileNotFoundError:
        value = {}
    if not isinstance(value, dict) or set(value) - {'topics', 'appName', 'icon'}:
        raise ValueError('Invalid notification preferences')
    topics = value.get('topics', TOPICS)
    name = value.get('appName', APP_NAME)
    icon = value.get('icon', ICON_URL)
    if not isinstance(topics, str) or not re.fullmatch(r'[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*', topics):
        raise ValueError('Invalid topics')
    if not isinstance(name, str) or not name.strip() or len(name) > 80:
        raise ValueError('Invalid app name')
    if 'icon' in value and (not isinstance(icon, str) or not re.fullmatch(r'/(?!/)[A-Za-z0-9_./-]+', icon) or '..' in icon):
        raise ValueError('Invalid icon path')
    return {'topics': topics, 'appName': name, 'icon': icon}

@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()

def initialize():
    global public_key
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    DATA.mkdir(exist_ok=True)
    if not KEY.exists():
        private = ec.generate_private_key(ec.SECP256R1())
        with KEY.open('xb') as f:
            os.chmod(KEY, 0o600)
            f.write(private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    private = serialization.load_pem_private_key(KEY.read_bytes(), password=None)
    public_key = base64.urlsafe_b64encode(private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)).decode().rstrip('=')
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS subscriptions (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL,
          created REAL NOT NULL, updated REAL NOT NULL, last_test REAL NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, label TEXT NOT NULL DEFAULT 'Browser device',
          last_seen REAL, last_sent REAL, last_error TEXT, state TEXT NOT NULL DEFAULT 'active');
        CREATE TABLE IF NOT EXISTS alert_groups (
          subscriber TEXT NOT NULL, signature TEXT NOT NULL, event TEXT NOT NULL,
          started REAL NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(subscriber,signature));
        CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, received REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS queue (
          event TEXT NOT NULL, subscriber TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
          body TEXT NOT NULL, created REAL NOT NULL, next_try REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(event,subscriber));
        CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS preferences (
          owner TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS inbox_state (
          owner TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('read','dismissed')),
          updated REAL NOT NULL, PRIMARY KEY(owner,message));
        CREATE TABLE IF NOT EXISTS retained_messages (
          id TEXT PRIMARY KEY, time REAL NOT NULL, expires REAL NOT NULL, body TEXT NOT NULL);
        ''')
        db.execute("INSERT OR IGNORE INTO devices(id,owner,last_seen) SELECT id,owner,updated FROM subscriptions")
        db.execute('INSERT OR IGNORE INTO state VALUES (?,?)', ('cursor', str(int(time.time()))))
    os.chmod(DB, 0o600)

def owner_for_cookie(cookie):
    if not cookie or len(cookie) > 16384:
        return None
    request = Request(SESSION_URL, headers={
        'Cookie':cookie, 'Host':urlsplit(ORIGIN).netloc, 'X-Forwarded-Proto':'https'})
    with urlopen(request, timeout=5) as response:
        session = json.loads(response.read(32768))
    user = session.get('user') or {}
    identity = user.get('gatherIdentity') or user.get('id') or user.get('email')
    if not isinstance(identity, str) or not identity:
        return None
    owner = hashlib.sha256(identity.encode()).hexdigest()
    # Upgrade email-keyed installations only when the identity provider verified the email.
    email = user.get('email')
    if user.get('gatherIdentity') and user.get('emailVerified') is True and isinstance(email, str) and email:
        legacy = hashlib.sha256(email.encode()).hexdigest()
        if legacy != owner:
            with connect() as db:
                db.execute('UPDATE subscriptions SET owner=? WHERE owner=?', (owner,legacy))
                db.execute('UPDATE devices SET owner=? WHERE owner=?', (owner,legacy))
                db.execute('''INSERT INTO inbox_state SELECT ?,message,status,updated FROM inbox_state WHERE owner=?
                  ON CONFLICT(owner,message) DO UPDATE SET
                  status=CASE WHEN inbox_state.status='dismissed' OR excluded.status='dismissed' THEN 'dismissed' ELSE 'read' END,
                  updated=MAX(inbox_state.updated,excluded.updated)''', (owner,legacy))
                db.execute('DELETE FROM inbox_state WHERE owner=?', (legacy,))
                db.execute('INSERT OR IGNORE INTO preferences SELECT ?,body FROM preferences WHERE owner=?', (owner,legacy))
                db.execute('DELETE FROM preferences WHERE owner=?', (legacy,))
    return owner

def validate_subscription(value):
    if not isinstance(value, dict):
        raise ValueError('Invalid subscription')
    endpoint = value.get('endpoint', '')
    if not isinstance(endpoint, str) or len(endpoint) > 2048:
        raise ValueError('Invalid endpoint')
    parsed = urlsplit(endpoint)
    host = parsed.hostname or ''
    allowed = (host in ('web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com')
               or host.endswith('.push.apple.com') or host.endswith('.notify.windows.com'))
    if not allowed or parsed.scheme != 'https' or parsed.port not in (None,443) or parsed.username or parsed.password or parsed.fragment or not parsed.path:
        raise ValueError('Unsupported push provider')
    keys = value.get('keys')
    if not isinstance(keys, dict):
        raise ValueError('Invalid subscription keys')
    for name, size in [('auth',16), ('p256dh',65)]:
        key = keys.get(name, '')
        # A 65-byte public key needs at most 88 base64 characters including padding.
        if not isinstance(key, str) or len(key) > 88 or not re.fullmatch(r'[A-Za-z0-9_-]{1,88}={0,2}', key):
            raise ValueError('Invalid subscription keys')
        decoded = base64.urlsafe_b64decode(key + '=' * (-len(key) % 4))
        if len(decoded) != size or name == 'p256dh' and decoded[0] != 4:
            raise ValueError('Invalid subscription keys')
    return {'endpoint':endpoint, 'keys':{k:keys[k] for k in ('auth','p256dh')}}

def subscription_id(subscription):
    return hashlib.sha256(subscription['endpoint'].encode()).hexdigest()

def payload(message):
    return {'id':str(message['id']), 'title':str(message.get('title') or message['topic'])[:120],
            'body':str(message.get('message', 'Open Gather to view this notification.'))[:500],
            'topic':message.get('topic'), 'priority':message.get('priority', 3)}

def replay(topics, since, limit=None, ident=None):
    """Reject in-stream errors too: ntfy may already have sent HTTP 200."""
    if not re.fullmatch(r'[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*', topics) or not re.fullmatch(r'[A-Za-z0-9_-]+', since):
        raise ValueError('Invalid notification replay cursor')
    query = '?poll=1&since='+since + ('&id='+ident if ident else '')
    request = Request(NTFY_URL+'/'+topics+'/json'+query,
                      headers={'Authorization':os.environ['NTFY_AUTH']})
    messages = deque(maxlen=limit)
    with urlopen(request, timeout=15) as response:
        for line in response:
            item = json.loads(line)
            if not isinstance(item, dict) or 'error' in item or 'code' in item:
                raise RuntimeError('Incomplete notification replay')
            if item.get('event') == 'message' and item.get('topic') in topics.split(','):
                messages.append(item)
        if getattr(response, 'headers', {}).get('X-Messages-Truncated') == '1' and (limit is None or len(messages) < limit):
            raise RuntimeError('Incomplete notification replay')
    return list(messages)

def cache_messages(db, messages, now):
    for item in messages:
        expires = min(item.get('expires', item['time']+30*86400), item['time']+30*86400)
        body = {k:item[k] for k in MESSAGE_FIELDS if k in item}
        db.execute('INSERT OR REPLACE INTO retained_messages VALUES (?,?,?,?)',
                   (item['id'],item['time'],expires,json.dumps(body)))
    db.execute('DELETE FROM retained_messages WHERE expires<=?', (now,))
    db.execute('''DELETE FROM retained_messages WHERE id NOT IN
                  (SELECT id FROM retained_messages ORDER BY time DESC,rowid DESC LIMIT 200)''')

def cached_feed(db):
    return [json.loads(row[0]) for row in db.execute(
        'SELECT body FROM retained_messages WHERE expires>? ORDER BY time DESC,rowid DESC LIMIT 200',
        (time.time(),))]

def retained_feed(topics):
    """Share a durable, bounded inbox instead of replaying 30 days per caller."""
    with feed_lock:
        now = time.time()
        with connect() as db:
            row = db.execute("SELECT value FROM state WHERE key='feed'").fetchone()
            saved = json.loads(row[0]) if row else {}
            row = db.execute("SELECT value FROM state WHERE key='feed_retry'").fetchone()
            retry = json.loads(row[0]) if row else {}
            current = saved.get('topics') == topics
            feed = cached_feed(db) if current else []
        if current and now-saved['checked'] < 30:
            return feed
        if retry.get('topics') == topics and now < retry['after']:
            raise RuntimeError('Notification replay retry pending')
        replace = not current or now-saved['replayed'] >= 300
        try:
            if not current:
                # Find the newest 200 without downloading a busy topic's entire
                # month. Empty/sparse topics still receive the full retention window.
                for since in ('1h','6h','24h','168h','720h'):
                    messages = replay(topics, since, limit=200)
                    if len(messages) >= 200:
                        break
            elif replace:
                # Reconcile deletions and cache expiry within the displayed window.
                since = str(int(feed[-1]['time'])-1) if len(feed) == 200 else '720h'
                messages = replay(topics, since, limit=200)
            else:
                messages = replay(topics, saved['cursor'], limit=200)
        except Exception:
            # Concurrent readers/retries must let ntfy's bandwidth budget refill
            # instead of repeatedly spending it on the start of the same replay.
            with connect() as db:
                db.execute("INSERT OR REPLACE INTO state VALUES ('feed_retry',?)",
                           (json.dumps({'topics':topics,'after':time.time()+60}),))
            raise
        cursor = messages[-1]['id'] if messages else (saved['cursor'] if current and not replace else str(int(now)-1))
        state = {'topics':topics, 'cursor':cursor, 'checked':now,
                 'replayed':now if replace else saved['replayed']}
        with connect() as db:
            if replace:
                db.execute('DELETE FROM retained_messages')
            cache_messages(db, messages, now)
            db.execute("INSERT OR REPLACE INTO state VALUES ('feed',?)", (json.dumps(state),))
            db.execute("DELETE FROM state WHERE key='feed_retry'")
            return cached_feed(db)

def unread_badge(db, owner, messages):
    row = db.execute('SELECT body FROM preferences WHERE owner=?', (owner,)).fetchone()
    if row and json.loads(row['body']).get('badge') is False:
        return 0
    states = {row['message'] for row in db.execute(
        'SELECT message FROM inbox_state WHERE owner=? AND updated>=?', (owner,time.time()-31*86400))}
    return sum(message['id'] not in states for message in messages)

def ingest(messages, now, topics=None):
    topics = topics or runtime_settings()['topics']
    with feed_lock, connect() as db:
        row = db.execute("SELECT value FROM state WHERE key='feed'").fetchone()
        if row and json.loads(row[0]).get('topics') == topics:
            # Persist the new inbox entry before its push is eligible for delivery.
            cache_messages(db, [m for m in messages if m.get('event') == 'message' and m.get('topic') in topics.split(',')], now)
        for message in messages:
            if message.get('event') != 'message' or message.get('topic') not in topics.split(','):
                continue
            ident = message['id']
            inserted = db.execute('INSERT OR IGNORE INTO events VALUES (?,?)',(ident,now)).rowcount
            if inserted and now - 86400 <= message['time'] <= now + 300:
                body = json.dumps(payload(message))
                for sub in db.execute('SELECT id,owner FROM subscriptions WHERE created<=?',(message['time']+1,)).fetchall():
                    saved = db.execute('SELECT body FROM preferences WHERE owner=?', (sub['owner'],)).fetchone()
                    rules = validate_rules(json.loads(saved[0]).get('rules', {}) if saved else {})
                    if not allowed(rules, message, now):
                        continue
                    group_seconds = 0 if critical(rules, message) else rules['groupSeconds']
                    if group_seconds:
                        signature = hashlib.sha256(json.dumps([message.get('topic'),message.get('title'),message.get('message'),message.get('priority',3)]).encode()).hexdigest()
                        group = db.execute('SELECT * FROM alert_groups WHERE subscriber=? AND signature=?', (sub['id'],signature)).fetchone()
                        if group and now-group['started'] < group_seconds:
                            grouped = payload(message)
                            grouped['repeatCount'] = group['count']+1
                            grouped['body'] = grouped['body'][:450]+' ('+str(grouped['repeatCount'])+' occurrences)'
                            changed = db.execute('UPDATE queue SET body=? WHERE event=? AND subscriber=?', (json.dumps(grouped),group['event'],sub['id'])).rowcount
                            if changed:
                                db.execute('UPDATE alert_groups SET count=count+1 WHERE subscriber=? AND signature=?', (sub['id'],signature))
                                continue
                        db.execute('INSERT OR REPLACE INTO alert_groups VALUES (?,?,?,?,?)', (sub['id'],signature,ident,now,1))
                    db.execute('INSERT OR IGNORE INTO queue(event,subscriber,body,created,next_try) VALUES (?,?,?,?,?)',
                               (ident,sub['id'],body,now,now+group_seconds))
            db.execute('UPDATE state SET value=? WHERE key=?',(ident,'cursor'))
        db.execute('DELETE FROM inbox_state WHERE updated<?',(now-31*86400,))
        db.execute('DELETE FROM events WHERE received<?',(now-31*86400,))
        db.execute('DELETE FROM queue WHERE created<?',(now-86400,))
        db.execute('DELETE FROM alert_groups WHERE started<?', (now-86400,))

def poll():
    global last_poll
    topics = runtime_settings()['topics']
    with connect() as db:
        previous = db.execute("SELECT value FROM state WHERE key='topics'").fetchone()
        if previous and previous[0] != topics:
            db.execute("UPDATE state SET value=? WHERE key='cursor'", (str(int(time.time())),))
        db.execute("INSERT OR REPLACE INTO state VALUES ('topics', ?)", (topics,))
        cursor = db.execute("SELECT value FROM state WHERE key='cursor'").fetchone()[0]
    # The cursor is a server-produced message ID or the initial Unix timestamp.
    if not re.fullmatch(r'[A-Za-z0-9_-]+', cursor):
        raise ValueError('Invalid cursor')
    messages = replay(topics, cursor)
    ingest(messages, time.time(), topics)
    last_poll = time.time()

def deliver(subscription, body):
    import requests
    from pywebpush import webpush
    class NoRedirectSession(requests.Session):
        def request(self, *args, **kwargs):
            kwargs['allow_redirects'] = False
            return super().request(*args, **kwargs)
    with NoRedirectSession() as session:
        response = webpush(subscription_info=validate_subscription(subscription), data=body,
                          vapid_private_key=str(KEY), vapid_claims={'sub':ORIGIN},
                          ttl=86400, timeout=10, requests_session=session)
        if response.status_code not in (200,201,202):
            raise RuntimeError('Push service rejected delivery')

def drain(send=deliver):
    now = time.time()
    with connect() as db:
        rows = db.execute('''SELECT q.*,s.body AS subscription FROM queue q JOIN subscriptions s ON s.id=q.subscriber
                             WHERE q.next_try<=? ORDER BY q.created LIMIT 20''',(now,)).fetchall()
    if not rows:
        return
    try:
        messages = retained_feed(runtime_settings()['topics'])
    except Exception:
        # Still deliver the alert if ntfy is unavailable; older workers can refresh
        # the badge themselves. Do not substitute zero for an unknown count.
        messages = None
    for row in rows:
        # Recheck after selection so an unsubscribe removes pending sends.
        with connect() as db:
            subscriber = db.execute('SELECT owner FROM subscriptions WHERE id=?',(row['subscriber'],)).fetchone()
            if not subscriber:
                continue
            body = json.loads(row['body'])
            saved = db.execute('SELECT body FROM preferences WHERE owner=?', (subscriber['owner'],)).fetchone()
            rules = validate_rules(json.loads(saved[0]).get('rules', {}) if saved else {})
            if not row['event'].startswith('test-') and not allowed(rules, body, now):
                db.execute('DELETE FROM queue WHERE event=? AND subscriber=?', (row['event'],row['subscriber']))
                continue
            if messages is not None:
                # Calculate at delivery, including retries, to include current read
                # state and preferences without a browser session or extra fetches.
                body['badgeCount'] = unread_badge(db, subscriber['owner'], messages)
        try:
            send(json.loads(row['subscription']), json.dumps(body))
        except Exception as error:
            response = getattr(error, 'response', None)
            code = response.status_code if response is not None else None
            with connect() as db:
                db.execute('UPDATE devices SET last_error=?,state=? WHERE id=?',
                           ('HTTP '+str(code) if isinstance(code,int) else 'Send failed', 'expired' if code in (404,410) else 'retrying', row['subscriber']))
                if code in (404,410):
                    db.execute('DELETE FROM subscriptions WHERE id=?',(row['subscriber'],))
                else:
                    delay = min(3600, 30 * 2**min(row['attempts'],7))
                    db.execute('UPDATE queue SET attempts=attempts+1,next_try=? WHERE event=? AND subscriber=?',
                               (now+delay,row['event'],row['subscriber']))
        else:
            with connect() as db:
                db.execute("UPDATE devices SET last_sent=?,last_error=NULL,state='active' WHERE id=?", (now,row['subscriber']))
                db.execute('DELETE FROM queue WHERE event=? AND subscriber=?',(row['event'],row['subscriber']))

def worker():
    while True:
        try:
            poll()
        except Exception:
            pass  # /health exposes staleness without logging credentials or message content.
        time.sleep(10)

def delivery_worker():
    while True:
        try:
            drain()
        except Exception:
            pass
        time.sleep(5)

class Handler(BaseHTTPRequestHandler):
    def respond(self, status, data, content_type='application/json'):
        body = json.dumps(data).encode() if content_type == 'application/json' else data
        self.send_response(status)
        self.send_header('Content-Type',content_type)
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def owner(self):
        try:
            owner = owner_for_cookie(self.headers.get('Cookie',''))
        except Exception:
            self.respond(503,{'error':'Sign-in service unavailable'})
            return None
        if owner is None:
            self.respond(401,{'error':'Sign in to Gather'})
        return owner

    def inbox(self, owner, updates=None, preferences=None):
        with connect() as db:
            if preferences is not None:
                previous = db.execute('SELECT body FROM preferences WHERE owner=?', (owner,)).fetchone()
                preferences = {**(json.loads(previous[0]) if previous else {}), **preferences}
                db.execute('INSERT INTO preferences VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET body=excluded.body',
                           (owner,json.dumps(preferences)))
            row = db.execute('SELECT body FROM preferences WHERE owner=?', (owner,)).fetchone()
            saved_preferences = {'badge':True, 'pushPage':True, 'inboxView':'panel'}
            if row:
                saved_preferences.update(json.loads(row['body']))
            if updates is not None:
                # Dismissal wins over a stale device's read/import operation.
                db.executemany('''INSERT INTO inbox_state VALUES (?,?,?,?)
                  ON CONFLICT(owner,message) DO UPDATE SET
                  status=CASE WHEN inbox_state.status='dismissed' THEN 'dismissed' ELSE excluded.status END,
                  updated=excluded.updated''',
                  [(owner, ident, status, time.time()) for ident, status in updates.items()])
            states = {row['message']:row['status'] for row in db.execute(
                'SELECT message,status FROM inbox_state WHERE owner=? AND updated>=?', (owner,time.time()-31*86400))}
        return self.respond(200, {'account':owner, 'states':states, 'preferences':saved_preferences})

    def do_GET(self):
        try:
            self.get()
        except Exception:
            self.respond(503,{'error':'Notification service temporarily unavailable'})

    def get(self):
        preferences = runtime_settings()
        topics = preferences['topics']
        if self.path == PREFIX+'feed':
            if not self.owner():
                return
            return self.respond(200,{'messages':retained_feed(topics),'checked_at':int(time.time())})
        if self.path.startswith(PREFIX+'message/'):
            if not self.owner():
                return
            ident = self.path[len(PREFIX+'message/'):]
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', ident):
                return self.respond(400,{'error':'Invalid notification ID'})
            messages = replay(topics, '720h', ident=ident)
            for item in messages:
                if item.get('id') == ident:
                    message = {k:item[k] for k in MESSAGE_FIELDS if k in item}
                    return self.respond(200,{'message':message})
            return self.respond(404,{'error':'Notification expired or unavailable'})
        if self.path == PREFIX+'sw.js':
            return self.respond(200,Path('/app/sw.js').read_text().replace('__GATHER_ICON__', json.dumps(preferences['icon'])).encode(),'application/javascript; charset=utf-8')
        if self.path == PREFIX+'manifest.json':
            return self.respond(200,json.dumps({'id':'/','name':preferences['appName'],'short_name':preferences['appName'],'start_url':'/','scope':'/','display':'standalone','background_color':'#182938','theme_color':'#182938','icons':[{'src':preferences['icon'],'sizes':'512x512','type':'image/png'}]}).encode(),'application/manifest+json')
        if self.path == PREFIX+'health':
            return self.respond(200 if time.time()-last_poll < 120 else 503, {'ready':time.time()-last_poll < 120})
        if self.path not in (PREFIX+'config', PREFIX+'inbox-state', PREFIX+'diagnostics'):
            return self.respond(404,{'error':'Not found'})
        owner = self.owner()
        if owner:
            if self.path == PREFIX+'diagnostics':
                with connect() as db:
                    row = db.execute('SELECT body FROM preferences WHERE owner=?', (owner,)).fetchone()
                    rules = validate_rules(json.loads(row[0]).get('rules', {}) if row else {})
                    devices = [dict(row) for row in db.execute("SELECT id,label,last_seen,last_sent,last_error,state FROM devices WHERE owner=? ORDER BY CASE WHEN state IN ('active','retrying') THEN 0 ELSE 1 END,last_seen DESC LIMIT 50", (owner,))]
                    pending = db.execute('SELECT count(*) FROM queue q JOIN subscriptions s ON q.subscriber=s.id WHERE s.owner=?', (owner,)).fetchone()[0]
                try:
                    messages = retained_feed(topics)
                    with connect() as db:
                        expected = unread_badge(db, owner, messages)
                except Exception:
                    expected = None
                return self.respond(200, {'account':owner,'devices':devices,'rules':rules,'topics':topics.split(','),
                    'expectedBadge':expected,'pending':pending,'lastPoll':last_poll or None,
                    'version':Path('/app/SOURCE_VERSION').read_text().strip() if Path('/app/SOURCE_VERSION').exists() else os.environ.get('GATHER_VERSION', 'unknown'),
                    'revision':os.environ.get('GATHER_REVISION','unknown')})
            if self.path == PREFIX+'inbox-state':
                return self.inbox(owner)
            self.respond(200,{'publicKey':public_key,'account':owner,'pushRecovery':True})

    def do_POST(self):
        try:
            self.post()
        except Exception:
            self.respond(503,{'error':'Push service temporarily unavailable'})

    def post(self):
        if self.path not in [PREFIX+x for x in ('subscribe','unsubscribe','status','test','inbox-state','rules','device')]:
            return self.respond(404,{'error':'Not found'})
        if self.headers.get('Origin') != ORIGIN or self.headers.get('X-Gather-Push') != '1':
            return self.respond(403,{'error':'Invalid request origin'})
        if self.headers.get('Content-Type','').split(';')[0] != 'application/json':
            return self.respond(415,{'error':'Expected JSON'})
        owner = self.owner()
        if owner is None:
            return
        try:
            size = int(self.headers.get('Content-Length','0'))
            if not 0 < size <= (32768 if self.path == PREFIX+'inbox-state' else 8192):
                return self.respond(413,{'error':'Invalid request size'})
            value = json.loads(self.rfile.read(size))
            if self.path in (PREFIX+'rules', PREFIX+'device'):
                if not isinstance(value, dict) or value.get('account') != owner:
                    return self.respond(409,{'error':'Account changed; refresh Gather'})
                with connect() as db:
                    if self.path.endswith('/rules'):
                        rules = validate_rules(value.get('rules'))
                        row = db.execute('SELECT body FROM preferences WHERE owner=?', (owner,)).fetchone()
                        saved = json.loads(row[0]) if row else {}
                        saved['rules'] = rules
                        db.execute('INSERT OR REPLACE INTO preferences VALUES (?,?)', (owner,json.dumps(saved)))
                    else:
                        ident = value.get('id')
                        device = db.execute('SELECT owner FROM devices WHERE id=? AND owner=?', (ident,owner)).fetchone()
                        if not device:
                            return self.respond(404,{'error':'Device unavailable'})
                        if value.get('action') == 'revoke':
                            db.execute('DELETE FROM subscriptions WHERE id=? AND owner=?', (ident,owner))
                            db.execute("UPDATE devices SET state='revoked' WHERE id=? AND owner=?", (ident,owner))
                        elif value.get('action') == 'rename' and isinstance(value.get('label'),str) and 1 <= len(value['label'].strip()) <= 80:
                            db.execute('UPDATE devices SET label=? WHERE id=? AND owner=?', (value['label'].strip(),ident,owner))
                        else:
                            raise ValueError('Invalid device operation')
                return self.respond(200,{'ok':True})
            if self.path == PREFIX+'inbox-state':
                if not isinstance(value, dict) or value.get('account') != owner:
                    return self.respond(409,{'error':'Account changed; refresh Gather'})
                updates = value.get('updates')
                if not isinstance(updates, dict) or len(updates) > 200 or any(
                    not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', ident) or status not in ('read','dismissed')
                    for ident,status in updates.items()):
                    return self.respond(400,{'error':'Invalid notification status updates'})
                preferences = value.get('preferences')
                if preferences is not None and (not isinstance(preferences, dict) or
                    set(preferences) - {'badge','pushPage','inboxView','rules'} or
                    not {'badge','pushPage','inboxView'} <= set(preferences) or
                    type(preferences.get('badge')) is not bool or type(preferences.get('pushPage')) is not bool or
                    preferences.get('inboxView') not in ('panel','page')):
                    return self.respond(400,{'error':'Invalid notification preferences'})
                if preferences is not None and 'rules' in preferences:
                    validate_rules(preferences.pop('rules'))
                return self.inbox(owner, updates, preferences)
            # Recovery requests carry the account that opted in before awaiting
            # browser APIs. Reject a sign-in change before binding or removing it.
            if isinstance(value, dict) and 'account' in value and value['account'] != owner:
                return self.respond(409,{'error':'Account changed; refresh Gather before changing push settings'})
            subscription = validate_subscription(value)
        except (ValueError, TypeError, KeyError):
            return self.respond(400,{'error':'Invalid browser subscription'})
        ident = subscription_id(subscription)
        now = time.time()
        with connect() as db:
            existing = db.execute('SELECT * FROM subscriptions WHERE id=?',(ident,)).fetchone()
            device_owner = db.execute('SELECT owner FROM devices WHERE id=?', (ident,)).fetchone()
            if (existing and existing['owner'] != owner) or (device_owner and device_owner['owner'] != owner):
                return self.respond(409,{'error':'This browser subscription belongs to a different account. Reset browser notifications before enabling.'})
            if self.path.endswith('/status'):
                if existing:
                    db.execute('UPDATE devices SET last_seen=? WHERE id=? AND owner=?', (now,ident,owner))
                device = db.execute('SELECT state FROM devices WHERE id=? AND owner=?', (ident,owner)).fetchone()
                return self.respond(200,{'enabled':existing is not None,'deviceId':ident,'revoked':bool(device and device['state']=='revoked')})
            if self.path.endswith('/subscribe'):
                count = db.execute('SELECT count(*) FROM subscriptions WHERE owner=?',(owner,)).fetchone()[0]
                if existing is None and count >= 10:
                    return self.respond(409,{'error':'Device limit reached; disable push on an older device first'})
                db.execute('''INSERT INTO subscriptions(id,owner,body,created,updated) VALUES (?,?,?,?,?)
                              ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated=excluded.updated''',
                           (ident,owner,json.dumps(subscription),now,now))
                db.execute("INSERT INTO devices(id,owner,last_seen) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,state='active'", (ident,owner,now))
                db.execute('DELETE FROM devices WHERE owner=? AND id NOT IN (SELECT id FROM subscriptions) AND id NOT IN (SELECT id FROM devices WHERE owner=? ORDER BY last_seen DESC LIMIT 50)', (owner,owner))
            elif self.path.endswith('/unsubscribe'):
                db.execute('DELETE FROM subscriptions WHERE id=? AND owner=?',(ident,owner))
                db.execute("UPDATE devices SET state='disabled' WHERE id=? AND owner=?", (ident,owner))
            elif self.path.endswith('/test'):
                if existing is None:
                    return self.respond(404,{'error':'Enable push on this device first'})
                if now-existing['last_test'] < 60:
                    return self.respond(429,{'error':'Wait one minute before another test'})
                test_id='test-'+uuid.uuid4().hex
                body=json.dumps({'id':test_id,'title':runtime_settings()['appName']+' push test','body':'Gather notifications are enabled on this device.'})
                db.execute('INSERT INTO queue(event,subscriber,body,created,next_try) VALUES (?,?,?,?,?)',(test_id,ident,body,now,now))
                db.execute('UPDATE subscriptions SET last_test=? WHERE id=?',(now,ident))
        self.respond(200,{'ok':True})

    def log_message(self, *_):
        pass

if __name__ == '__main__':
    os.umask(0o077)
    initialize()
    threading.Thread(target=worker,daemon=True).start()
    threading.Thread(target=delivery_worker,daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
