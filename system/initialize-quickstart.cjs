// Versioned one-time initializer for the encrypted SQLite system store.
// Normal application startup never creates replacement keys or records.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function initialize(root, env, seal, owner = { uid: 1001, gid: 1001 }) {
  const domain = env.GATHER_DOMAIN || '';
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) || domain.includes('..') || domain.endsWith('.example.com'))
    throw Error('Set GATHER_DOMAIN to your real hostname, without a scheme, path or port.');
  const origin = new URL(env.GATHER_EXTERNAL_URL || 'https://' + domain);
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash || origin.hostname !== domain)
    throw Error('GATHER_EXTERNAL_URL must be an HTTPS origin matching GATHER_DOMAIN.');
  const issuer = new URL(env.GATHER_OIDC_ISSUER);
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash || issuer.hostname.endsWith('.example.com'))
    throw Error('Set a valid HTTPS OIDC issuer.');
  for (const field of ['GATHER_OIDC_CLIENT_ID', 'GATHER_OIDC_CLIENT_SECRET', 'GATHER_ADMIN_IDS'])
    if (!env[field]?.trim() || env[field].includes('replace-with-') || /[\r\n\0]/.test(env[field]))
      throw Error(`Set ${field} before initializing.`);
  if (env.GATHER_ADMIN_IDS.split(',').some(x => !x.trim())) throw Error('Administrator subjects cannot be empty.');

  const databases = ['control', 'app', 'notification'].map(d => path.join(root, 'system-data', d, 'settings.sqlite'));
  const keys = ['app', 'notification'].map(d => path.join(root, 'keys', d + '.key'));
  const passwords = ['reader', 'publisher'].map(d => path.join(root, 'private', 'ntfy-' + d + '-password'));
  const completion = path.join(root, "private", "setup-complete");
  const required = [...databases, ...keys, ...passwords, completion];
  if (required.some(f => fs.existsSync(f))) {
    if (!required.every(f => fs.existsSync(f)) || keys.some(f => fs.statSync(f).size !== 32))
      throw Error('Partial initialization found. Preserve these files and restore a complete backup, or use a new empty installation directory.');
    console.log('Existing system storage retained. Setup does not overwrite credentials or dashboard settings.');
    return;
  }
  process.umask(0o077);
  const directories = ['config', 'config/.gather-runtime', 'system-data', 'system-data/control', 'system-data/app', 'system-data/notification', 'keys', 'notification-data', 'ntfy-data', 'private'];
  for (const d of directories) fs.mkdirSync(path.join(root, d), { recursive: true, mode: 0o700 });
  const appKey = crypto.randomBytes(32), notificationKey = crypto.randomBytes(32);
  const readerPassword = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keys[0], appKey, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(keys[1], notificationKey, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(passwords[0], readerPassword, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(passwords[1], crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  const revision = crypto.randomUUID();
  const records = {
    app: seal({ revision, env: {
      GATHER_AUTH_ENABLED: 'true', GATHER_AUTH_SECRET: crypto.randomBytes(48).toString('base64'),
      GATHER_EXTERNAL_URL: origin.origin,
      GATHER_ALLOWED_HOSTS: origin.host + ',gateway,gather:3000,localhost:3000,127.0.0.1:3000',
      GATHER_OIDC_ISSUER: issuer.href.replace(/\/+$/, ''),
      GATHER_OIDC_CLIENT_ID: env.GATHER_OIDC_CLIENT_ID,
      GATHER_OIDC_CLIENT_SECRET: env.GATHER_OIDC_CLIENT_SECRET,
      GATHER_OIDC_NAME: env.GATHER_OIDC_NAME || 'SSO', GATHER_EDITOR_ENABLED: 'true', GATHER_ADMIN_IDS: env.GATHER_ADMIN_IDS,
    } }, appKey, 'app'),
    notification: seal({ revision, env: {
      GATHER_ORIGIN: origin.origin, SESSION_URL: 'http://gather:3000/api/auth/session',
      NTFY_URL: 'http://ntfy:8080', NTFY_TOPICS: 'gather',
      NTFY_AUTH: 'Basic ' + Buffer.from('gather-reader:' + readerPassword).toString('base64'), PUSH_DATA: '/data',
    } }, notificationKey, 'notification'),
  };
  for (const [i, domainName] of ['control', 'app', 'notification'].entries()) {
    const db = new DatabaseSync(databases[i]);
    try {
      db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
        CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
        INSERT INTO schema_migrations VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
      if (domainName === 'control') {
        db.exec(`CREATE TABLE control(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
          CREATE TABLE requests(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL) STRICT;
          CREATE TABLE audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, revision TEXT) STRICT;
          INSERT INTO control VALUES('state','{"phase":"idle"}');
          INSERT INTO audit(at,action) VALUES(strftime('%Y-%m-%dT%H:%M:%fZ','now'),'quickstart_initialize');`);
      } else {
        db.exec("CREATE TABLE records(slot TEXT PRIMARY KEY CHECK(slot IN ('active','rollback')), envelope TEXT NOT NULL) STRICT;");
        db.prepare('INSERT INTO records VALUES(?,?)').run('active', JSON.stringify(records[domainName]));
      }
      db.exec('PRAGMA user_version=1');
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Database integrity check failed.');
    } finally { db.close(); }
  }
  // Seed only new files. The normal dashboard editor owns them after installation.
  const initialFiles = {
    'settings.yaml': 'title: Gather\ngather:\n  accountMenu: true\n  notifications: true\n',
    'services.yaml': '[]\n', 'bookmarks.yaml': '[]\n', 'widgets.yaml': '[]\n',
  };
  for (const [name, body] of Object.entries(initialFiles)) {
    const target = path.join(root, 'config', name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, body, { flag: 'wx', mode: 0o600 });
  }
  function ownership(target) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const child = path.join(target, entry.name);
      if (entry.isSymbolicLink()) throw Error('Setup directories must not contain symbolic links.');
      if (entry.isDirectory()) ownership(child);
      fs.chownSync(child, owner.uid, owner.gid);
      fs.chmodSync(child, entry.isDirectory() ? 0o700 : 0o600);
    }
    fs.chownSync(target, owner.uid, owner.gid);
    fs.chmodSync(target, 0o700);
  }
  for (const d of ['config', 'system-data', 'keys', 'notification-data']) ownership(path.join(root, d));
  fs.writeFileSync(completion, 'Gather system schema 1 initialized\n', { flag: 'wx', mode: 0o600 });
  console.log('Encrypted system storage, distinct keys and private ntfy credentials initialized.');
}

async function main() {
  if (process.argv[2] === 'publish-test') {
    const password = fs.readFileSync('/run/secrets/ntfy-publisher-password', 'utf8');
    const response = await fetch('http://ntfy:8080/gather', { method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from('gather-publisher:' + password).toString('base64'), Title: 'Gather is connected' },
      body: 'Your encrypted Gather installation is receiving notifications.', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Notification publish failed; check ntfy and its topic permissions.');
    console.log('Broker accepted test notification; check authenticated inbox separately.');
  } else {
    const { seal } = require('./vault.cjs');
    initialize('/setup', process.env, seal);
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { initialize };
