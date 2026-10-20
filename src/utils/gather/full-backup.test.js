import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import backup from "../../../system/full-backup.cjs";
import vault from "../../../system/vault.cjs";

const info = { version: "1.0.4", origin: "https://gather.example.test" };
let temp, base, key, salt;
function createSource(root) {
  for (const directory of Object.values(backup.roots(root))) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(root, "config/settings.yaml"), "title: My restored dashboard\n");
  for (const domain of ["app", "notification"]) {
    const secret = crypto.randomBytes(32);
    fs.writeFileSync(path.join(root, `keys/${domain}.key`), secret);
    const db = new DatabaseSync(path.join(root, `system/${domain}/settings.sqlite`));
    db.exec("CREATE TABLE records(slot TEXT PRIMARY KEY,envelope TEXT); PRAGMA user_version=1");
    db.prepare("INSERT INTO records VALUES ('active',?)").run(
      JSON.stringify(
        vault.seal({ env: { GATHER_EXTERNAL_URL: info.origin, TEST_SECRET: `${domain}-secret` } }, secret, domain),
      ),
    );
    db.close();
  }
  const control = new DatabaseSync(path.join(root, "system/control/settings.sqlite"));
  control.exec(
    "CREATE TABLE control(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE requests(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE audit(id INTEGER PRIMARY KEY,action TEXT); PRAGMA user_version=1;",
  );
  control.prepare("INSERT INTO requests VALUES (1,?)").run('{"stale":true}');
  control.close();
  fs.mkdirSync(path.join(root, "system/control/maintenance"));
  fs.writeFileSync(path.join(root, "system/control/maintenance/transport.key"), "must-not-export");
  const push = new DatabaseSync(path.join(root, "push/push.sqlite3"));
  push.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE subscriptions(id TEXT,body TEXT); INSERT INTO subscriptions VALUES ('device','private subscription');",
  );
  push.close();
  fs.writeFileSync(
    path.join(root, "push/vapid.pem"),
    crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }),
  );
}
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "gather-full-backup-"));
  base = path.join(temp, "source");
  key = crypto.randomBytes(32);
  salt = crypto.randomBytes(16);
  createSource(base);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(temp, { recursive: true, force: true });
});
describe("complete encrypted Gather backup", () => {
  it("round trips configuration, account databases, keys and notification state without exporting controller secrets or stale jobs", () => {
    const users = new DatabaseSync(path.join(base, "config/.gather-users.sqlite"));
    users.exec("CREATE TABLE users(id TEXT); INSERT INTO users VALUES ('account-with-personal-layout');");
    users.close();
    const staged = path.join(temp, "snapshot"),
      archive = path.join(temp, "backup.gather");
    const manifest = backup.snapshot(base, staged, info);
    expect(manifest.files.some((f) => f.path.includes("transport.key"))).toBe(false);
    backup.encrypt(manifest, staged, archive, key, salt);
    expect(fs.readFileSync(archive).includes(Buffer.from("app-secret"))).toBe(false);
    expect(fs.readFileSync(archive).includes(Buffer.from("private subscription"))).toBe(false);
    const extracted = path.join(temp, "extracted");
    const parsed = backup.decrypt(archive, extracted, key, info);
    const restored = path.join(temp, "restored");
    createSource(restored);
    fs.writeFileSync(path.join(restored, "config/extra.yaml"), "remove me");
    backup.restore(parsed, extracted, restored, info);
    expect(fs.existsSync(path.join(restored, "config/extra.yaml"))).toBe(false);
    expect(fs.readFileSync(path.join(restored, "config/settings.yaml"), "utf8")).toContain("My restored dashboard");
    expect(fs.readFileSync(path.join(restored, "keys/app.key"))).toEqual(
      fs.readFileSync(path.join(base, "keys/app.key")),
    );
    const db = new DatabaseSync(path.join(restored, "system/control/settings.sqlite"));
    expect(db.prepare("SELECT count(*) AS count FROM requests").get().count).toBe(0);
    db.close();
    const accounts = new DatabaseSync(path.join(restored, "config/.gather-users.sqlite"));
    expect(accounts.prepare("SELECT id FROM users").get().id).toBe("account-with-personal-layout");
    accounts.close();
  });
  it("rejects metadata exceeding the restore parser limit before creating a backup", () => {
    const manifest = {
      ...info,
      format: 1,
      files: Array.from({ length: 5000 }, (_, index) => ({
        label: "config",
        path: `${"a".repeat(220)}${index}`,
        size: 0,
        sha256: "a".repeat(64),
        sqlite: false,
      })),
    };
    const archive = path.join(temp, "oversized.gather");
    expect(() => backup.encrypt(manifest, temp, archive, key, salt)).toThrow(/metadata limit/);
    expect(fs.existsSync(archive)).toBe(false);
  });
  it("completes partial filesystem writes for encrypted and decrypted data", () => {
    const staged = path.join(temp, "snapshot"),
      archive = path.join(temp, "partial.gather");
    const manifest = backup.snapshot(base, staged, info);
    const original = fs.writeSync;
    vi.spyOn(fs, "writeSync").mockImplementation((...args) => {
      if (!Buffer.isBuffer(args[1])) return original(...args);
      const [fd, buffer, offset = 0, length = buffer.length - offset, position] = args;
      return original(fd, buffer, offset, Math.max(1, Math.floor(length / 2)), position);
    });
    backup.encrypt(manifest, staged, archive, key, salt);
    const parsed = backup.decrypt(archive, path.join(temp, "partial-restored"), key, info);
    expect(parsed.files).toEqual(manifest.files);
  });
  it("includes committed WAL entries in SQLite snapshots", () => {
    const live = new DatabaseSync(path.join(base, "config/wal.sqlite"));
    try {
      live.exec(
        "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE items(id INTEGER); INSERT INTO items VALUES (42)",
      );
      const staged = path.join(temp, "wal-snapshot");
      backup.snapshot(base, staged, info);
      const copy = new DatabaseSync(path.join(staged, "config/wal.sqlite"));
      expect(copy.prepare("SELECT id FROM items").get().id).toBe(42);
      copy.close();
    } finally {
      live.close();
    }
  });
  it("rejects wrong keys and tampering before creating restored files", () => {
    const staged = path.join(temp, "snapshot"),
      archive = path.join(temp, "backup.gather");
    backup.encrypt(backup.snapshot(base, staged, info), staged, archive, key, salt);
    const destination = path.join(temp, "bad");
    expect(() => backup.decrypt(archive, destination, crypto.randomBytes(32), info)).toThrow();
    expect(fs.existsSync(destination)).toBe(false);
    const changed = fs.readFileSync(archive);
    changed[50] ^= 1;
    fs.writeFileSync(archive, changed);
    expect(() => backup.decrypt(archive, destination, key, info)).toThrow();
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.existsSync(`${destination}.plain`)).toBe(false);
  });
  it("rejects incompatible origins, versions, traversal, duplicate entries and missing keys", () => {
    const staged = path.join(temp, "snapshot"),
      manifest = backup.snapshot(base, staged, info);
    for (const changed of [
      { ...manifest, origin: "https://other.test" },
      { ...manifest, version: "2.0.0" },
      { ...manifest, files: [...manifest.files, manifest.files[0]] },
      { ...manifest, files: manifest.files.filter((f) => f.label !== "keys") },
      {
        ...manifest,
        files: [
          ...manifest.files,
          { label: "config", path: "../escape", size: 0, sha256: "a".repeat(64), sqlite: false },
        ],
      },
    ]) {
      expect(() => backup.validate(changed, staged, info)).toThrow();
    }
    expect(backup.safe("/tmp/escape")).toBe(false);
    expect(backup.safe("a\\b")).toBe(false);
  });
  it("rejects symlinks and corrupt databases without mutating the source", () => {
    fs.symlinkSync("settings.yaml", path.join(base, "config/linked.yaml"));
    expect(() => backup.snapshot(base, path.join(temp, "symlink"), info)).toThrow(/links/);
    fs.unlinkSync(path.join(base, "config/linked.yaml"));
    fs.writeFileSync(path.join(base, "config/broken.sqlite"), "not a database");
    expect(() => backup.snapshot(base, path.join(temp, "broken"), info)).toThrow(/database/);
    expect(fs.readFileSync(path.join(base, "config/settings.yaml"), "utf8")).toContain("restored dashboard");
  });
  it("validates included keys against the encrypted vault before touching live data", () => {
    fs.writeFileSync(path.join(base, "keys/app.key"), crypto.randomBytes(32));
    expect(() => backup.snapshot(base, path.join(temp, "wrong-key"), info)).toThrow();
  });
});
