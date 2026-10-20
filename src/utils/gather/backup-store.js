import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import database from "../../../system/database.cjs";
import vault from "../../../system/vault.cjs";

import { ConfigError } from "./config-store";
export const MAX_UPLOAD = 257 * 1024 * 1024;
const terminal = ["complete", "confirmed", "rolled_back", "failed"];
const fail = (message, status = 400) => {
  throw new ConfigError(message, status);
};
export function maintenanceDirectory() {
  if (!process.env.GATHER_SYSTEM_DIR)
    fail("Complete backups require encrypted system storage and the updated recovery controller.", 409);
  const root = path.join(vault.locations().directory, "control", "maintenance");
  fs.mkdirSync(path.join(root, "jobs"), { recursive: true, mode: 0o700 });
  for (const directory of [root, path.join(root, "jobs")])
    if (fs.lstatSync(directory).isSymbolicLink()) fail("Maintenance storage unavailable.", 503);
  return root;
}
export function jobDirectory(id) {
  if (typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
    fail("Invalid backup identifier.");
  const directory = path.join(maintenanceDirectory(), "jobs", id);
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink())
    fail("Maintenance storage unavailable.", 503);
  return directory;
}
export function readJob(id) {
  const job = JSON.parse(fs.readFileSync(path.join(jobDirectory(id), "job.json"), "utf8"));
  if (job.id !== id) fail("Invalid backup job.", 409);
  return job;
}
export function activeMaintenance() {
  const pointer = path.join(vault.locations().directory, "control", "maintenance", "active.json");
  if (!fs.existsSync(pointer)) return null;
  return readJob(JSON.parse(fs.readFileSync(pointer, "utf8")).id);
}
export function maintenanceBusy() {
  const job = activeMaintenance();
  return job && !terminal.includes(job.phase);
}
function publicJob(job) {
  let result;
  try {
    result = JSON.parse(fs.readFileSync(path.join(jobDirectory(job.id), "result.json"), "utf8"));
  } catch {
    /* Not inspected yet. */
  }
  return {
    id: job.id,
    action: job.action,
    phase: job.phase,
    created: job.created,
    started: job.started || null,
    deadline: job.deadline || null,
    message: job.message || "Waiting for the recovery controller.",
    result: result
      ? {
          version: result.version,
          origin: result.origin,
          created: result.created,
          files: result.files,
          bytes: result.bytes,
        }
      : null,
  };
}
export function listBackups(subject) {
  const root = maintenanceDirectory();
  const jobs = fs
    .readdirSync(path.join(root, "jobs"))
    .flatMap((id) => {
      try {
        const job = readJob(id);
        return job.owner === subject ? [publicJob(job)] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.created - a.created);
  const active = activeMaintenance();
  return {
    jobs,
    active: active && (active.owner === subject || active.phase === "awaiting_confirmation") ? publicJob(active) : null,
  };
}
function transportKey() {
  const target = path.join(maintenanceDirectory(), "transport.key");
  try {
    fs.writeFileSync(target, crypto.randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  if (fs.lstatSync(target).isSymbolicLink()) fail("Maintenance storage unavailable.", 503);
  const key = fs.readFileSync(target);
  if (key.length !== 32) fail("Maintenance key is invalid.", 503);
  return key;
}
function version() {
  for (const root of ["/usr/share/gather", process.cwd()]) {
    try {
      return fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
    } catch {
      /* Next source. */
    }
  }
  fail("App version is unavailable.", 503);
}
export function withMaintenanceLock(fn) {
  return database.control(
    vault.locations().directory,
    (db) =>
      database.transaction(db, () => {
        const state = database.value(db, "state", { phase: "idle" });
        const heartbeat = database.value(db, "heartbeat", 0);
        const controller = database.value(db, "controller", {});
        if (
          ["awaiting_confirmation", "applying", "rolling_back"].includes(state.phase) ||
          db.prepare("SELECT id FROM requests WHERE id=1").get()
        )
          fail("Finish the pending system configuration change first.", 409);
        if (Date.now() - heartbeat > 20000 || heartbeat > Date.now() + 5000 || controller.backupFormat !== 1)
          fail("Update all components and wait for a healthy recovery controller before making a backup.", 503);
        return fn(db);
      }),
    true,
  );
}
export function queueBackup(action, password, subject, id) {
  if (
    !["backup", "inspect"].includes(action) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 1024
  )
    fail("Use a backup passphrase of 12–1024 characters.");
  return withMaintenanceLock(() => {
    if (maintenanceBusy()) fail("Another backup or restore is in progress.", 409);
    const root = maintenanceDirectory();
    if (action === "backup" && fs.readdirSync(path.join(root, "jobs")).length >= 10)
      fail("Delete an old backup job before creating another.", 409);
    const ident = action === "backup" ? crypto.randomUUID() : id;
    const directory = jobDirectory(ident);
    let salt;
    if (action === "backup") {
      fs.mkdirSync(directory, { mode: 0o700 });
      salt = crypto.randomBytes(16);
    } else {
      const upload = JSON.parse(fs.readFileSync(path.join(directory, "upload.json"), "utf8"));
      if (
        upload.owner !== subject ||
        Date.now() - upload.created > 3600000 ||
        (fs.existsSync(path.join(directory, "job.json")) && readJob(ident).phase !== "uploaded")
      )
        fail("Upload a fresh backup for this account.", 409);
      const header = Buffer.alloc(36);
      const fd = fs.openSync(path.join(directory, "upload.gather"), "r");
      try {
        if (fs.readSync(fd, header) !== header.length || header.subarray(0, 8).toString() !== "GATHBK01")
          fail("This is not a Gather backup.");
      } finally {
        fs.closeSync(fd);
      }
      salt = header.subarray(8, 24);
    }
    const key = crypto.scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const origin = new URL(process.env.GATHER_EXTERNAL_URL || process.env.NEXTAUTH_URL).origin;
    const job = {
      id: ident,
      action,
      owner: subject,
      phase: "queued",
      version: version(),
      origin,
      created: Date.now(),
      salt: salt.toString("base64"),
      secret: vault.seal({ key: key.toString("base64") }, transportKey(), "app"),
    };
    key.fill(0);
    vault.atomicWrite(path.join(directory, "job.json"), job);
    vault.atomicWrite(path.join(root, "active.json"), { id: ident });
    return publicJob(job);
  });
}
export function backupAction(action, id, token) {
  const job = readJob(id),
    file = path.join(jobDirectory(id), "job.json");
  if (action === "confirm") {
    if (job.phase !== "awaiting_confirmation" || job.deadline <= Date.now())
      fail("No restore is awaiting confirmation.", 409);
    if (
      !Number.isInteger(token.gatherLoginAt) ||
      token.gatherLoginAt < Math.ceil((job.activated || job.started) / 1000) ||
      token.gatherLoginRevision !== process.env.GATHER_SYSTEM_REVISION
    )
      fail("Sign out, sign in to the restored installation, then confirm.", 403);
    job.confirmed = true;
    vault.atomicWrite(file, job);
    return publicJob(job);
  }
  if (job.owner !== token.sub) fail("This backup belongs to a different administrator.", 403);
  if (action === "restore")
    return withMaintenanceLock(() => {
      if (job.phase !== "validated" || activeMaintenance()?.id !== id)
        fail("Inspect the backup before restoring.", 409);
      job.phase = "restore_queued";
      vault.atomicWrite(file, job);
      return publicJob(job);
    });
  if (action === "cancel" && job.phase === "validated") {
    job.phase = "failed";
    job.message = "Restore cancelled before any live data changed.";
    delete job.secret;
    vault.atomicWrite(file, job);
    return publicJob(job);
  }
  if (action === "delete" && [...terminal, "uploaded"].includes(job.phase)) {
    if (activeMaintenance()?.id === id) fs.rmSync(path.join(maintenanceDirectory(), "active.json"));
    fs.rmSync(jobDirectory(id), { recursive: true });
    return { deleted: true };
  }
  fail("This operation is not available in the current backup state.", 409);
}
