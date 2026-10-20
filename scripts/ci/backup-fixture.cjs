/* Disposable complete-backup fixture; no real accounts, credentials or push endpoints. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const vault = require("/app/system/vault.cjs");
const root = "/fixture";
const id = "11111111-1111-4111-8111-111111111111";
const info = {
  version: fs.readFileSync("/usr/share/gather/VERSION", "utf8").trim(),
  origin: "https://gather.example.test",
};
const jobRoot = path.join(root, "system/control/maintenance");
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, value, { mode: 0o600 });
}
if (process.argv[2] === "initialize") {
  for (const folder of [
    "config",
    "push",
    "keys",
    "system/app",
    "system/notification",
    "system/control",
    `system/control/maintenance/jobs/${id}`,
  ])
    fs.mkdirSync(path.join(root, folder), { recursive: true, mode: 0o700 });
  write(path.join(root, "config/settings.yaml"), "title: Snapshot before edits\n");
  for (const domain of ["app", "notification"]) {
    const key = crypto.randomBytes(32);
    write(path.join(root, `keys/${domain}.key`), key);
    const db = new DatabaseSync(path.join(root, `system/${domain}/settings.sqlite`));
    db.exec("CREATE TABLE records(slot TEXT PRIMARY KEY,envelope TEXT); PRAGMA user_version=1");
    db.prepare("INSERT INTO records VALUES ('active',?)").run(
      JSON.stringify(vault.seal({ revision: "fixture", env: { GATHER_EXTERNAL_URL: info.origin } }, key, domain)),
    );
    db.close();
  }
  const control = new DatabaseSync(path.join(root, "system/control/settings.sqlite"));
  control.exec(
    "CREATE TABLE control(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE requests(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE audit(id INTEGER PRIMARY KEY,at TEXT,action TEXT,revision TEXT); PRAGMA user_version=1",
  );
  control.prepare("INSERT INTO control VALUES ('state',?)").run(JSON.stringify({ phase: "idle" }));
  control.close();
  const push = new DatabaseSync(path.join(root, "push/push.sqlite3"));
  push.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE subscriptions(id TEXT,body TEXT); INSERT INTO subscriptions VALUES ('synthetic-device','synthetic subscription');",
  );
  push.close();
  write(
    path.join(root, "push/vapid.pem"),
    crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }),
  );
  write(path.join(jobRoot, "transport.key"), crypto.randomBytes(32));
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync("disposable-backup-passphrase", salt, 32, { N: 32768, r: 8, p: 1, maxmem: 67108864 });
  const job = {
    ...info,
    id,
    action: "backup",
    owner: "synthetic-admin",
    created: Date.now(),
    phase: "queued",
    salt: salt.toString("base64"),
    secret: vault.seal({ key: key.toString("base64") }, fs.readFileSync(path.join(jobRoot, "transport.key")), "app"),
  };
  vault.atomicWrite(path.join(jobRoot, `jobs/${id}/job.json`), job);
  vault.atomicWrite(path.join(jobRoot, "active.json"), { id });
} else if (process.argv[2] === "inspect") {
  const directory = path.join(jobRoot, "jobs", id);
  const job = JSON.parse(fs.readFileSync(path.join(directory, "job.json")));
  if (job.phase !== "complete") throw Error("Backup failed");
  fs.copyFileSync(path.join(directory, "backup.gather"), path.join(directory, "upload.gather"));
  const key = crypto.scryptSync("disposable-backup-passphrase", Buffer.from(job.salt, "base64"), 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 67108864,
  });
  job.secret = vault.seal({ key: key.toString("base64") }, fs.readFileSync(path.join(jobRoot, "transport.key")), "app");
  job.action = "inspect";
  job.phase = "queued";
  vault.atomicWrite(path.join(directory, "job.json"), job);
} else if (process.argv[2] === "restore") {
  const file = path.join(jobRoot, `jobs/${id}/job.json`);
  const job = JSON.parse(fs.readFileSync(file));
  if (job.phase !== "validated") throw Error("Inspection failed");
  write(path.join(root, "config/settings.yaml"), "title: State to recover on rollback\n");
  job.phase = "restore_queued";
  vault.atomicWrite(file, job);
} else if (process.argv[2] === "expire") {
  const file = path.join(jobRoot, `jobs/${id}/job.json`);
  const job = JSON.parse(fs.readFileSync(file));
  if (
    job.phase !== "awaiting_confirmation" ||
    !fs.readFileSync(path.join(root, "config/settings.yaml"), "utf8").includes("before edits")
  )
    throw Error("Restore did not activate snapshot");
  job.deadline = 0;
  vault.atomicWrite(file, job);
} else if (process.argv[2] === "verify") {
  const job = JSON.parse(fs.readFileSync(path.join(jobRoot, `jobs/${id}/job.json`)));
  if (
    job.phase !== "rolled_back" ||
    !fs.readFileSync(path.join(root, "config/settings.yaml"), "utf8").includes("recover on rollback")
  )
    throw Error("Rollback failed");
  if (job.secret) throw Error("Completed maintenance retained the imported backup key");
  process.stdout.write(
    "Complete encrypted backup, inspection, restore and automatic rollback passed with isolated containers.\n",
  );
} else throw Error("Unknown fixture action");
