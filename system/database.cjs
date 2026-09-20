const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
function open(file, readOnly = true) {
  if (!fs.existsSync(file)) throw new Error("System database is not initialized");
  const db = new DatabaseSync(file, { readOnly, allowExtension: false, enableDoubleQuotedStringLiterals: false });
  try {
    db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;");
    if (db.prepare("PRAGMA user_version").get().user_version !== 1)
      throw new Error("Unsupported system database schema");
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
function envelope(root, domain, slot = "active") {
  if (!["app", "notification"].includes(domain)) throw new Error("Invalid configuration domain");
  const db = open(path.join(root, domain, "settings.sqlite"));
  try {
    const row = db.prepare("SELECT envelope FROM records WHERE slot = ?").get(slot);
    if (!row) throw new Error("Missing encrypted configuration");
    return JSON.parse(row.envelope);
  } finally {
    db.close();
  }
}
function control(root, fn, write = false) {
  const db = open(path.join(root, "control", "settings.sqlite"), !write);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
function value(db, key, fallback) {
  const row = db.prepare("SELECT value FROM control WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : fallback;
}
function put(db, key, data) {
  db.prepare("INSERT INTO control(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(
    key,
    JSON.stringify(data),
  );
}
function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
module.exports = { open, envelope, control, value, put, transaction };
