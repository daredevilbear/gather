// Shared by the image-owned initializer and the server. Passwords never leave this module.
const { randomBytes, randomUUID, scryptSync, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(require("node:crypto").scrypt);
const OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCHEMA = `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, subject TEXT UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL,
  role TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_seen TEXT);
  CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, happened TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS dashboards (owner TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS local_credentials (
  subject TEXT PRIMARY KEY REFERENCES users(subject), username TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL, hash TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  failures INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);`;
function localAccountsEnabled(env = process.env) {
  return (
    ![env.GATHER_OIDC_ISSUER, env.GATHER_OIDC_CLIENT_ID, env.GATHER_OIDC_CLIENT_SECRET].some(Boolean) &&
    (env.GATHER_LOCAL_ACCOUNTS_ENABLED === "true" || !env.GATHER_AUTH_PASSWORD)
  );
}
function validPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 1024 || /[\r\n\0]/.test(password))
    throw Error("Choose a password of 12–1024 characters without line breaks.");
}
function username(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._@+-]{2,79}$/i.test(value))
    throw Error("Choose a username of 3–80 letters, numbers, dots, underscores, @, + or hyphens.");
  return value.toLowerCase();
}
function hashPassword(password) {
  validPassword(password);
  const salt = randomBytes(32).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64, OPTIONS).toString("hex") };
}
function createAccount(db, { name, email = "", role, username: login, password }) {
  const normalized = username(login);
  const digest = hashPassword(password);
  if (db.prepare("SELECT subject FROM local_credentials WHERE username=?").get(normalized))
    throw Error("A user with this username already exists.");
  const subject = "local:" + randomUUID();
  db.prepare("INSERT INTO users(id,subject,name,email,role,enabled) VALUES (?,?,?,?,?,1)").run(
    randomUUID(),
    subject,
    name,
    email,
    role,
  );
  db.prepare("INSERT INTO local_credentials(subject,username,salt,hash) VALUES (?,?,?,?)").run(
    subject,
    normalized,
    digest.salt,
    digest.hash,
  );
  return subject;
}
// Bound unknown-user work too, without creating database rows for attacker-supplied names.
const attempts = new Map();
function throttle(login, now, scope) {
  const key = scope + ":" + (typeof login === "string" ? login.toLowerCase().slice(0, 80) : "");
  let entry = attempts.get(key);
  if (!entry || entry.until <= now) entry = { count: 0, until: now + 60000 };
  if (attempts.size >= 1000 && !attempts.has(key)) attempts.delete(attempts.keys().next().value);
  attempts.set(key, entry);
  entry.count++;
  return entry.count > 10;
}
async function authenticate(db, login, password, scope = "global") {
  const now = Date.now();
  if (throttle(login, now, scope) || typeof password !== "string" || !password || password.length > 1024) return null;
  let normalized;
  try {
    normalized = username(login);
  } catch {
    return null;
  }
  const row = db
    .prepare(
      `SELECT c.*, u.name, u.email, u.enabled FROM local_credentials c
    JOIN users u ON u.subject=c.subject WHERE c.username=?`,
    )
    .get(normalized);
  if (row?.locked_until > now) return null;
  // The same cost for unknown users avoids a cheap username timing oracle.
  const provided = await scrypt(password, row?.salt || "0".repeat(64), 64, OPTIONS);
  if (!row) return null;
  const expected = Buffer.from(row.hash, "hex");
  const match = expected.length === provided.length && timingSafeEqual(provided, expected);
  // A reset that occurs during hashing must not authorize the previous password.
  const current = db
    .prepare(
      `SELECT c.version,u.enabled FROM local_credentials c
    JOIN users u ON u.subject=c.subject WHERE c.subject=?`,
    )
    .get(row.subject);
  if (!current?.enabled || current.version !== row.version) return null;
  if (!match) {
    db.prepare(
      `UPDATE local_credentials SET failures=CASE WHEN locked_until<=? AND failures>=5 THEN 1 ELSE failures+1 END,
      locked_until=CASE WHEN failures>=4 AND (failures<5 OR locked_until>?) THEN ? ELSE 0 END WHERE subject=? AND version=?`,
    ).run(now, now, now + 60000, row.subject, row.version);
    return null;
  }
  db.prepare("UPDATE local_credentials SET failures=0,locked_until=0 WHERE subject=? AND version=?").run(
    row.subject,
    row.version,
  );
  return { id: row.subject, name: row.name, email: row.email || null, localCredentialVersion: row.version };
}
function resetPassword(db, subject, password) {
  const digest = hashPassword(password);
  const result = db
    .prepare(
      `UPDATE local_credentials SET salt=?,hash=?,version=version+1,failures=0,locked_until=0
    WHERE subject=?`,
    )
    .run(digest.salt, digest.hash, subject);
  if (result.changes !== 1) throw Error("Local account not found.");
}
module.exports = { SCHEMA, localAccountsEnabled, validPassword, username, createAccount, authenticate, resetPassword };
