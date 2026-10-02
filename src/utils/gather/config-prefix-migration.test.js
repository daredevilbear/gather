import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";

import { migrate } from "../../../scripts/migrate-config-prefix.cjs";
import vault from "../../../system/vault.cjs";
import { variablesStore } from "./variables-store";

let root, configDir, appKeyFile, key;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "gather-migration-"));
  configDir = path.join(root, "config");
  fs.mkdirSync(configDir);
  key = crypto.randomBytes(32);
  appKeyFile = path.join(root, "key");
  fs.writeFileSync(appKeyFile, key);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const options = () => ({ fromPrefix: "LEGACY_", configDir, appKeyFile });
function prepareVariables() {
  const store = variablesStore(configDir, key);
  store.save("GATHER_VAR_TOKEN", "secret", "disposable-sensitive-value");
  store.toggle("GATHER_VAR_TOKEN", false);
  store.close();
  const db = new DatabaseSync(path.join(configDir, ".gather-variables.sqlite"));
  const name = "LEGACY_VAR_TOKEN",
    kind = "secret",
    iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`gather-variables-v1:${name}:${kind}`));
  const body = Buffer.concat([cipher.update("disposable-sensitive-value"), cipher.final()]);
  db.prepare("UPDATE variables SET name=?,envelope=?").run(
    name,
    JSON.stringify({
      iv: iv.toString("base64"),
      body: body.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    }),
  );
  db.close();
}
it("previews without writes, then migrates placeholders, environment and encrypted state with backups", () => {
  prepareVariables();
  const yamlFile = path.join(configDir, "services.yaml");
  fs.writeFileSync(yamlFile, 'key: "{{LEGACY_VAR_TOKEN}}"\nurl: https://legacy.example.test\n');
  const envFile = path.join(root, ".env");
  fs.writeFileSync(envFile, "LEGACY_AUTH_SECRET=disposable-value\nGATHER_ADMIN_IDS=existing-account\n");
  const usersFile = path.join(configDir, ".gather-users.sqlite");
  let db = new DatabaseSync(usersFile);
  db.exec("CREATE TABLE dashboards(owner TEXT PRIMARY KEY,body TEXT,revision INTEGER)");
  db.prepare("INSERT INTO dashboards VALUES (?,?,1)").run("existing-account", '{"key":"{{LEGACY_VAR_TOKEN}}"}');
  db.close();
  const systemDir = path.join(root, "system");
  fs.mkdirSync(path.join(systemDir, "app"), { recursive: true });
  const systemFile = path.join(systemDir, "app/settings.sqlite");
  db = new DatabaseSync(systemFile);
  db.exec("CREATE TABLE records(slot TEXT PRIMARY KEY,envelope TEXT)");
  for (const slot of ["active", "rollback"])
    db.prepare("INSERT INTO records VALUES (?,?)").run(
      slot,
      JSON.stringify(vault.seal({ revision: slot, env: { LEGACY_AUTH_SECRET: "sealed-value" } }, key, "app")),
    );
  db.close();
  const opts = { ...options(), envFile, systemDir, backupDir: path.join(root, "backup") };
  const original = fs.readFileSync(yamlFile, "utf8");
  expect(migrate(opts)).toEqual({ files: 5, applied: false });
  expect(fs.readFileSync(yamlFile, "utf8")).toBe(original);
  expect(fs.existsSync(opts.backupDir)).toBe(false);
  expect(migrate({ ...opts, apply: true })).toEqual({ files: 5, applied: true });
  expect(fs.readFileSync(yamlFile, "utf8")).toContain("{{GATHER_VAR_TOKEN}}");
  expect(fs.readFileSync(yamlFile, "utf8")).toContain("https://legacy.example.test");
  expect(fs.readFileSync(envFile, "utf8")).toContain("GATHER_AUTH_SECRET=disposable-value");
  expect(fs.readFileSync(envFile, "utf8")).toContain("GATHER_ADMIN_IDS=existing-account");
  const store = variablesStore(configDir, key);
  expect(store.list()).toEqual([expect.objectContaining({ name: "GATHER_VAR_TOKEN", enabled: false })]);
  store.toggle("GATHER_VAR_TOKEN", true);
  expect(store.values()).toEqual([["GATHER_VAR_TOKEN", "disposable-sensitive-value"]]);
  store.close();
  db = new DatabaseSync(usersFile);
  expect(db.prepare("SELECT * FROM dashboards").get()).toMatchObject({
    owner: "existing-account",
    revision: 2,
    body: '{"key":"{{GATHER_VAR_TOKEN}}"}',
  });
  db.close();
  db = new DatabaseSync(systemFile);
  for (const row of db.prepare("SELECT * FROM records").all())
    expect(vault.unseal(JSON.parse(row.envelope), key, "app")).toEqual({
      revision: row.slot,
      env: { GATHER_AUTH_SECRET: "sealed-value" },
    });
  db.close();
  const manifest = JSON.parse(fs.readFileSync(path.join(opts.backupDir, "manifest.json")));
  const backup = manifest.find((entry) => entry.original === yamlFile);
  expect(fs.readFileSync(path.join(opts.backupDir, backup.backup), "utf8")).toBe(original);
  expect(fs.statSync(opts.backupDir).mode & 0o777).toBe(0o700);
  expect(fs.statSync(path.join(opts.backupDir, backup.backup)).mode & 0o777).toBe(0o600);
  expect(migrate({ ...opts, apply: true })).toEqual({ files: 0, applied: false });
});
it("rejects environment collisions before changing any file", () => {
  const envFile = path.join(root, ".env");
  const original = "LEGACY_AUTH_SECRET=first\nGATHER_AUTH_SECRET=second\n";
  fs.writeFileSync(envFile, original);
  expect(() => migrate({ ...options(), envFile, apply: true, backupDir: path.join(root, "backup") })).toThrow(
    "duplicate",
  );
  expect(fs.readFileSync(envFile, "utf8")).toBe(original);
});
it("rejects a wrong vault key before writing or backing up any state", () => {
  prepareVariables();
  fs.writeFileSync(appKeyFile, crypto.randomBytes(32));
  const file = path.join(configDir, ".gather-variables.sqlite"),
    before = fs.readFileSync(file);
  const backupDir = path.join(root, "backup");
  expect(() => migrate({ ...options(), apply: true, backupDir })).toThrow();
  expect(fs.readFileSync(file)).toEqual(before);
  expect(fs.existsSync(backupDir)).toBe(false);
});
it("rejects backup directories inside the state directory", () => {
  fs.writeFileSync(path.join(configDir, "settings.yaml"), 'title: "{{LEGACY_VAR_TITLE}}"\n');
  expect(() => migrate({ ...options(), apply: true, backupDir: path.join(configDir, "backup") })).toThrow("outside");
});

it("rejects a backup path whose parent symlink points into migrated state", () => {
  fs.writeFileSync(path.join(configDir, "settings.yaml"), 'title: "{{LEGACY_VAR_TITLE}}"\n');
  const alias = path.join(root, "alias");
  fs.symlinkSync(configDir, alias, "dir");
  expect(() => migrate({ ...options(), apply: true, backupDir: path.join(alias, "backup") })).toThrow("outside");
});
it("rejects colliding managed variables without changing encrypted state", () => {
  prepareVariables();
  const store = variablesStore(configDir, key);
  store.save("GATHER_VAR_TOKEN", "secret", "different-value");
  store.close();
  const file = path.join(configDir, ".gather-variables.sqlite"),
    before = fs.readFileSync(file);
  expect(() => migrate({ ...options(), apply: true, backupDir: path.join(root, "backup") })).toThrow("duplicate");
  expect(fs.readFileSync(file)).toEqual(before);
});
