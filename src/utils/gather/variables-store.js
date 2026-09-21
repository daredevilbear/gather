import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const VARIABLE_NAME = /^HOMEPAGE_VAR_[A-Z0-9_]{1,80}$/;
const keyPath = () => process.env.GATHER_APP_KEY_FILE || "/run/secrets/gather-app-key";
export function variablesAvailable() {
  return fs.existsSync(keyPath());
}

export function variablesStore(directory, suppliedKey) {
  const key = suppliedKey || fs.readFileSync(keyPath());
  if (key.length !== 32) throw Error("Invalid vault key");
  const file = path.join(directory, ".gather-variables.sqlite");
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()))
    throw Error("Variable storage is unavailable");
  const db = new DatabaseSync(file, { allowExtension: false });
  fs.chmodSync(file, 0o600);
  db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;");
  db.exec(
    "CREATE TABLE IF NOT EXISTS variables (name TEXT PRIMARY KEY, kind TEXT NOT NULL, envelope TEXT NOT NULL, enabled INTEGER NOT NULL, updated TEXT NOT NULL)",
  );
  const aad = (name, kind) => Buffer.from(`gather-variables-v1:${name}:${kind}`);
  function decrypt(row) {
    const { iv, body, tag } = JSON.parse(row.envelope);
    const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    cipher.setAAD(aad(row.name, row.kind));
    cipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([cipher.update(Buffer.from(body, "base64")), cipher.final()]).toString("utf8");
  }
  return {
    list() {
      return db
        .prepare("SELECT * FROM variables ORDER BY name")
        .all()
        .map((row) => ({
          name: row.name,
          kind: row.kind,
          enabled: Boolean(row.enabled),
          updated: row.updated,
          ...(row.kind === "variable" ? { value: decrypt(row) } : {}),
        }));
    },
    values() {
      return db
        .prepare("SELECT * FROM variables WHERE enabled=1")
        .all()
        .map((row) => [row.name, decrypt(row)]);
    },
    save(name, kind, value) {
      if (
        !VARIABLE_NAME.test(name) ||
        !["secret", "variable"].includes(kind) ||
        typeof value !== "string" ||
        value.length > 8192 ||
        !value.length
      )
        throw Error("Invalid variable");
      const previous = db.prepare("SELECT kind FROM variables WHERE name=?").get(name);
      if (previous && previous.kind !== kind) throw Error("Use a new name to change a secret or variable type");
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad(name, kind));
      const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      const envelope = JSON.stringify({
        iv: iv.toString("base64"),
        body: body.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
      });
      db.prepare(
        "INSERT INTO variables VALUES (?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET envelope=excluded.envelope, enabled=1, updated=excluded.updated",
      ).run(name, kind, envelope, 1, new Date().toISOString());
    },
    toggle(name, enabled) {
      if (!VARIABLE_NAME.test(name) || typeof enabled !== "boolean") throw Error("Invalid variable");
      db.prepare("UPDATE variables SET enabled=?,updated=? WHERE name=?").run(
        Number(enabled),
        new Date().toISOString(),
        name,
      );
    },
    close() {
      db.close();
    },
  };
}
export function managedVariables(directory) {
  if (!fs.existsSync(path.join(directory, ".gather-variables.sqlite"))) return [];
  const store = variablesStore(directory);
  try {
    return store.values();
  } finally {
    store.close();
  }
}
