import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import database from "../../../system/database.cjs";
import vault from "../../../system/vault.cjs";

import { activeMaintenance, backupAction, jobDirectory, listBackups, queueBackup } from "./backup-store";
let directory;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "gather-backup-jobs-"));
  vi.stubEnv("GATHER_SYSTEM_DIR", directory);
  vi.stubEnv("GATHER_EXTERNAL_URL", "https://gather.example.test");
  vi.stubEnv("GATHER_SYSTEM_REVISION", "revision");
  fs.mkdirSync(path.join(directory, "control"));
  const db = new DatabaseSync(path.join(directory, "control/settings.sqlite"));
  db.exec(
    "CREATE TABLE control(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE requests(id INTEGER PRIMARY KEY,value TEXT); PRAGMA user_version=1;",
  );
  database.put(db, "heartbeat", Date.now());
  database.put(db, "controller", { backupFormat: 1 });
  db.close();
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});
it("queues only protected metadata and an encrypted derived key, and never returns secret material", () => {
  const result = queueBackup("backup", "a-strong-test-password", "admin");
  expect(result.phase).toBe("queued");
  expect(result.secret).toBeUndefined();
  const job = activeMaintenance();
  expect(job.owner).toBe("admin");
  expect(job.secret.body).toBeTruthy();
  expect(fs.readFileSync(path.join(jobDirectory(job.id), "job.json"), "utf8")).not.toContain("a-strong-test-password");
  expect(listBackups("other").jobs).toEqual([]);
  expect(listBackups("other").active).toBeNull();
  expect(() => queueBackup("backup", "a-strong-test-password", "admin")).toThrow(/progress/);
});
it("rejects stale controllers, concurrent system changes and short passphrases", () => {
  expect(() => queueBackup("backup", "short", "admin")).toThrow(/passphrase/);
  database.control(directory, (db) => database.put(db, "state", { phase: "applying" }), true);
  expect(() => queueBackup("backup", "long-test-password", "admin")).toThrow(/configuration/);
  database.control(
    directory,
    (db) => {
      database.put(db, "state", { phase: "idle" });
      database.put(db, "heartbeat", 0);
    },
    true,
  );
  expect(() => queueBackup("backup", "long-test-password", "admin")).toThrow(/controller/);
});
it("requires a fresh sign-in before accepting a restore, and hides secret fields from the confirming administrator", () => {
  const result = queueBackup("backup", "long-test-password", "old-admin");
  const job = activeMaintenance();
  job.phase = "awaiting_confirmation";
  job.started = Date.now();
  job.deadline = Date.now() + 600000;
  vault.atomicWrite(path.join(jobDirectory(job.id), "job.json"), job);
  expect(listBackups("restored-admin").active.id).toBe(job.id);
  expect(() =>
    backupAction("confirm", result.id, { sub: "restored-admin", gatherLoginAt: 0, gatherLoginRevision: "revision" }),
  ).toThrow(/Sign out/);
  const confirmed = backupAction("confirm", result.id, {
    sub: "restored-admin",
    gatherLoginAt: Math.ceil(Date.now() / 1000),
    gatherLoginRevision: "revision",
  });
  expect(confirmed.secret).toBeUndefined();
  expect(activeMaintenance().confirmed).toBe(true);
  expect(() => backupAction("delete", result.id, { sub: "restored-admin" })).toThrow(/different administrator/);
});
