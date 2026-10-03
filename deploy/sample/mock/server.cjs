// Authored demo fixtures. Not an implementation copied from another reference.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const ORIGIN = 'https://localhost:8443';
const ISSUER = ORIGIN + '/oidc';
const CLIENT = 'gather-demo';
const SECRET = 'local-demo-client-secret';
const CALLBACK = ORIGIN + '/api/auth/callback/gather-oidc';
const accounts = {
  'demo-admin': { sub: 'demo-admin', name: 'Alex Administrator', email: 'alex@demo.invalid', email_verified: true },
  'demo-editor': { sub: 'demo-editor', name: 'Morgan Editor', email: 'morgan@demo.invalid', email_verified: true },
  'demo-viewer': { sub: 'demo-viewer', name: 'Sam Viewer', email: 'sam@demo.invalid', email_verified: true },
};
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = crypto.randomUUID();
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
const codes = new Map(), tokens = new Map();
const b64 = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const escape = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:16px system-ui;background:#0f172a;color:#e2e8f0;max-width:850px;padding:24px;margin:auto}h1{color:#67e8f9}a{color:#67e8f9}button,.card{display:block;background:#1e293b;border:1px solid #475569;border-radius:12px;padding:16px;margin:12px 0;color:#e2e8f0;font:inherit}button{cursor:pointer;width:100%;text-align:left}small{display:block;color:#94a3b8;margin-top:8px}strong{color:#6ee7b7}input{padding:10px;border-radius:8px}</style></head><body>${body}</body></html>`;
function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
}
function jwt(payload) {
  const body = b64({ alg: 'RS256', typ: 'JWT', kid }) + '.' + b64(payload);
  return body + '.' + crypto.sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url');
}
async function body(req) {
  let s = ''; for await (const chunk of req) { s += chunk; if (s.length > 65536) throw Error('Body too large'); }
  return s;
}
function authRequest(p) {
  return p.get('client_id') === CLIENT && p.get('redirect_uri') === CALLBACK && p.get('response_type') === 'code' && p.get('scope')?.split(' ').includes('openid');
}
async function publish(title, message, priority = '3') {
  const password = fs.readFileSync('/run/secrets/ntfy-publisher-password', 'utf8');
  const r = await fetch('http://ntfy:8080/gather', { method: 'POST', headers: {
    Authorization: 'Basic ' + Buffer.from('gather-publisher:' + password).toString('base64'),
    Title: title, Priority: priority, Click: ORIGIN + '/#operations',
  }, body: message, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw Error('Broker rejected demo notification');
  return r.json();
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, ORIGIN), p = url.searchParams;
    const path = url.pathname;
    // Logs record only method/path, never query strings, cookies, codes or credentials.
    console.log(req.method, path);
    if (path === '/mock/health') return send(res, 200, { status: 'ok', fixture: true });
    if (path === '/oidc/.well-known/openid-configuration') return send(res, 200, {
      issuer: ISSUER, authorization_endpoint: ISSUER + '/authorize', token_endpoint: ISSUER + '/token',
      userinfo_endpoint: ISSUER + '/userinfo', jwks_uri: ISSUER + '/jwks',
      response_types_supported: ['code'], subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'], scopes_supported: ['openid','profile','email'],
      token_endpoint_auth_methods_supported: ['client_secret_basic','client_secret_post'], code_challenge_methods_supported: ['S256'],
    });
    if (path === '/oidc/jwks') return send(res, 200, { keys: [jwk] });
    if (path === '/oidc/authorize') {
      if (!authRequest(p)) return send(res, 400, { error: 'invalid_request' });
      return send(res, 200, page('Choose a demo account', `<h1>Gather demo sign-in</h1><p>This local mock identity provider has no passwords. Choose an account to test Gather permissions.</p><form method="post" action="/oidc/choose">${[...p].map(([k,v])=>`<input type="hidden" name="${escape(k)}" value="${escape(v)}">`).join('')}${Object.values(accounts).map(a=>`<button name="account" value="${a.sub}">${a.name}<small>${a.email} — ${a.sub === 'demo-admin' ? 'Protected administrator' : 'Viewer until assigned a role in Users & access'}</small></button>`).join('')}</form><p>Fictional identities. Local demonstration only.</p>`), 'text/html');
    }
    if (path === '/oidc/choose' && req.method === 'POST') {
      const params = new URLSearchParams(await body(req));
      if (!authRequest(params) || !accounts[params.get('account')]) return send(res, 400, { error: 'invalid_request' });
      const code = crypto.randomBytes(24).toString('hex');
      codes.set(code, { user: accounts[params.get('account')], nonce: params.get('nonce'),
        challenge: params.get('code_challenge'), redirect: CALLBACK, expires: Date.now() + 120000 });
      const location = new URL(CALLBACK); location.searchParams.set('code', code);
      if (params.get('state')) location.searchParams.set('state', params.get('state'));
      res.writeHead(303, { Location: location.href }); return res.end();
    }
    if (path === '/oidc/token' && req.method === 'POST') {
      const params = new URLSearchParams(await body(req));
      const basic = 'Basic ' + Buffer.from(CLIENT + ':' + SECRET).toString('base64');
      if (req.headers.authorization !== basic && !(params.get('client_id') === CLIENT && params.get('client_secret') === SECRET)) return send(res, 401, { error: 'invalid_client' });
      const record = codes.get(params.get('code')); codes.delete(params.get('code'));
      if (!record || record.expires < Date.now() || params.get('grant_type') !== 'authorization_code' || params.get('redirect_uri') !== record.redirect) return send(res, 400, { error: 'invalid_grant' });
      if (record.challenge && crypto.createHash('sha256').update(params.get('code_verifier') || '').digest('base64url') !== record.challenge) return send(res, 400, { error: 'invalid_grant' });
      const access = crypto.randomBytes(32).toString('hex'), now = Math.floor(Date.now()/1000);
      tokens.set(access, { user: record.user, expires: Date.now() + 3600000 });
      return send(res, 200, { token_type: 'Bearer', access_token: access, expires_in: 3600,
        id_token: jwt({ ...record.user, iss: ISSUER, aud: CLIENT, iat: now, exp: now + 3600, ...(record.nonce ? { nonce: record.nonce } : {}) }) });
    }
    if (path === '/oidc/userinfo') {
      const token = tokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
      return token && token.expires > Date.now() ? send(res, 200, token.user) : send(res, 401, { error: 'invalid_token' });
    }
    const metrics = {
      home: { people: 3, lights: 7, switches: 2, watts: 482, temperature: 21.4, energyKwh: 8.6 },
      photos: { users: 3, photos: 12480, videos: 328, storage: 187904819200 },
      media: { movies: 246, series: 38, episodes: 1126, songs: 3850, albums: 294, streams: 2 },
      backups: { state: 'Complete', lastRun: new Date(Date.now()-1800000).toISOString(), duration: 248, bytes: 34359738368, jobs: 6 },
      storage: { usedPercent: 78, usedBytes: 1717986918400, freeBytes: 483183820800, disks: 4 },
      network: { devices: 24, upload: 1280000, download: 8240000, availability: 99.98 },
      health: { healthy: 12, degraded: 1, offline: 0, checks: 13 },
    };
    if (path.startsWith('/mock/api/')) {
      const kind = path.split('/').pop();
      if (kind === 'error') return send(res, 503, { error: 'Intentional demo outage' });
      if (kind === 'servers') return send(res, 200, { data: [
        { id: 'media', name: 'Media node', status: 'Healthy' }, { id: 'photos', name: 'Photo node', status: 'Healthy' },
        { id: 'backup', name: 'Backup node', status: 'Degraded' },
      ] });
      if (metrics[kind]) return send(res, 200, metrics[kind]);
    }
    if (path === '/mock/events.ics') {
      const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const events = ['Review dashboard','Check backup recovery','Test notification inbox'].map((summary,i)=>{
        const start = new Date(Date.now() + (i + 1)*86400000); start.setUTCHours(18,0,0,0);
        return `BEGIN:VEVENT\r\nUID:demo-${i}@gather.local\r\nDTSTAMP:${stamp(new Date())}\r\nDTSTART:${stamp(start)}\r\nDTEND:${stamp(new Date(start.getTime()+3600000))}\r\nSUMMARY:${summary}\r\nEND:VEVENT`;
      });
      return send(res, 200, `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Gather docs lab//Mock calendar//EN\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`, 'text/calendar');
    }
    if (path === '/mock/publish' && req.method === 'POST') {
      if (req.headers.origin !== ORIGIN) return send(res, 403, { error: 'Origin required' });
      await publish('Sample service update', 'A demo service sent this message through the private ntfy broker.', '4');
      return send(res, 200, { sent: true });
    }
    if (path === '/mock/status') return send(res, 200, page('Mock service status', '<h1>Service status</h1><div class="card"><strong>12 healthy</strong><p>1 degraded · 0 offline</p><small>Fictional values from the local mock service.</small></div>'), 'text/html');
    if (path.startsWith('/mock/')) return send(res, 200, page('Gather mock services', `<h1>Gather documentation lab</h1><p>All service data here is fictional and served by this Docker stack.</p><div class="card">Home · Photos · Media · Storage · Network · Backups</div><a href="/">Open Gather</a> · <a href="/mock/status">Status page</a><form action="/mock/search"><p><input name="q" placeholder="Search the demo" aria-label="Search the demo"> <button>Search</button></p></form>${p.has('q') ? `<p>Search received: ${escape(p.get('q'))}</p>` : ''}<button id="publish">Send a demo notification</button><p id="result" role="status"></p><script>document.getElementById('publish').onclick=async()=>{const r=await fetch('/mock/publish',{method:'POST'});document.getElementById('result').textContent=r.ok?'Sent — open Gather Notifications.':'Publish failed.'}</script>`), 'text/html');
    return send(res, 404, { error: 'No demo route' });
  } catch (error) { console.error('Mock request failed:', error.message); send(res, 500, { error: 'Mock request failed' }); }
});
server.listen(8090, '0.0.0.0', () => console.log('Local demo mocks ready'));
