/* Fixed-path maintenance helper. Runs from the installed app image without a network or Docker socket. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const vault = require("./vault.cjs");
const MAGIC = Buffer.from("GATHBK01");
const MAX = 256 * 1024 * 1024;
const MAX_FILES = 10000;
const TERMINAL = new Set(["complete", "confirmed", "rolled_back", "failed"]);
const roots = (base) => ({
  config: path.join(base, "config"),
  push: path.join(base, "push"),
  app: path.join(base, "system/app"),
  notification: path.join(base, "system/notification"),
  control: path.join(base, "system/control"),
  keys: path.join(base, "keys"),
});
function writeAll(fd, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = fs.writeSync(fd, buffer, offset, buffer.length - offset);
    if (!written) throw Error("Incomplete backup write");
    offset += written;
  }
}
function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Unsupported file");
  return stat;
}
function safe(relative) {
  return (
    typeof relative === "string" &&
    relative.length <= 1024 &&
    !relative.includes("\\") &&
    !relative.includes("\0") &&
    !path.posix.isAbsolute(relative) &&
    relative.split("/").every((part) => part && part !== "." && part !== "..")
  );
}
function allowed(label, relative) {
  if (!safe(relative) || !["config", "push", "app", "notification", "control", "keys"].includes(label)) return false;
  if (["app", "notification", "control"].includes(label)) return relative === "settings.sqlite";
  if (label === "keys") return ["app.key", "notification.key"].includes(relative);
  return (
    !relative.split("/").some((part) => part === ".gather-runtime" || part === "node_modules") &&
    !/-(wal|shm|journal)$/.test(relative)
  );
}
function walk(root, prefix = "") {
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw Error("Unsupported directory");
  return fs.readdirSync(root).flatMap((name) => {
    const relative = prefix ? `${prefix}/${name}` : name;
    const file = path.join(root, name),
      stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw Error("Symbolic links cannot be backed up");
    if (stat.isDirectory()) return name === ".gather-runtime" || name === "node_modules" ? [] : walk(file, relative);
    if (!stat.isFile()) throw Error("Unsupported file");
    return [relative];
  });
}
function hash(file) {
  const fd = fs.openSync(file, "r"),
    digest = crypto.createHash("sha256"),
    buffer = Buffer.alloc(65536);
  try {
    let size;
    while ((size = fs.readSync(fd, buffer))) digest.update(buffer.subarray(0, size));
  } finally {
    fs.closeSync(fd);
  }
  return digest.digest("hex");
}
function sqliteCheck(file) {
  const db = new DatabaseSync(file, { readOnly: true, allowExtension: false });
  try {
    db.exec("PRAGMA trusted_schema=OFF");
    if (Object.values(db.prepare("PRAGMA integrity_check").get())[0] !== "ok") throw Error("Invalid database");
  } finally {
    db.close();
  }
}
function snapshot(base, target, info) {
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  const files = [];
  let total = 0;
  for (const [label, root] of Object.entries(roots(base))) {
    const names = ["app", "notification", "control"].includes(label)
      ? ["settings.sqlite"]
      : label === "keys"
        ? ["app.key", "notification.key"]
        : walk(root);
    for (const relative of names.filter((name) => allowed(label, name))) {
      if (files.length >= MAX_FILES) throw Error("Too many backup files");
      const source = path.join(root, relative),
        destination = path.join(target, label, relative);
      const stat = regular(source);
      total += stat.size;
      if (total > MAX) throw Error("Backup exceeds 256 MiB limit");
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      const magic = Buffer.alloc(16);
      const fd = fs.openSync(source, "r");
      try {
        fs.readSync(fd, magic);
      } finally {
        fs.closeSync(fd);
      }
      const sqlite = magic.toString() === "SQLite format 3\0";
      if (sqlite) {
        const db = new DatabaseSync(source, { readOnly: true, allowExtension: false });
        try {
          db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000");
          db.prepare("VACUUM INTO ?").run(destination);
        } finally {
          db.close();
        }
        if (label === "control") {
          const copy = new DatabaseSync(destination, { allowExtension: false });
          try {
            copy.exec(
              "PRAGMA trusted_schema=OFF; DELETE FROM requests; DELETE FROM control WHERE key IN ('heartbeat','controller','confirmed','maintenance')",
            );
            copy.prepare("INSERT OR REPLACE INTO control VALUES ('state',?)").run(JSON.stringify({ phase: "idle" }));
          } finally {
            copy.close();
          }
        }
        sqliteCheck(destination);
      } else {
        if (
          ["app", "notification", "control"].includes(label) ||
          relative.endsWith(".sqlite") ||
          relative.endsWith(".sqlite3")
        )
          throw Error("Invalid database file");
        fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      }
      fs.chmodSync(destination, 0o600);
      files.push({ label, path: relative, size: regular(destination).size, sha256: hash(destination), sqlite });
    }
  }
  const manifest = { format: 1, version: info.version, origin: info.origin, created: new Date().toISOString(), files };
  validate(manifest, target, info);
  return manifest;
}
function validate(manifest, staged, expected) {
  if (
    manifest?.format !== 1 ||
    manifest.version !== expected.version ||
    manifest.origin !== expected.origin ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > MAX_FILES
  )
    throw Error("Incompatible backup version or public origin");
  const seen = new Set();
  let total = 0;
  for (const file of manifest.files) {
    const key = `${file.label}/${file.path}`;
    if (
      !allowed(file.label, file.path) ||
      seen.has(key) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      typeof file.sqlite !== "boolean"
    )
      throw Error("Invalid archive entry");
    seen.add(key);
    total += file.size;
    if (total > MAX) throw Error("Backup too large");
    if (staged) {
      const target = path.join(staged, key);
      if (regular(target).size !== file.size || hash(target) !== file.sha256) throw Error("Backup checksum failed");
      const header = Buffer.alloc(16);
      const fd = fs.openSync(target, "r");
      try {
        fs.readSync(fd, header);
      } finally {
        fs.closeSync(fd);
      }
      if (
        file.sqlite !== (header.toString() === "SQLite format 3\0") ||
        ((["app", "notification", "control"].includes(file.label) || /\.sqlite3?$/.test(file.path)) && !file.sqlite)
      )
        throw Error("Invalid database entry");
      if (file.sqlite) sqliteCheck(target);
    }
  }
  for (const label of ["app", "notification", "control"])
    if (!seen.has(`${label}/settings.sqlite`)) throw Error("Missing system database");
  for (const name of ["app", "notification"]) if (!seen.has(`keys/${name}.key`)) throw Error("Missing recovery key");
  if (!seen.has("push/push.sqlite3") || !seen.has("push/vapid.pem")) throw Error("Missing notification state");
  if (staged) {
    const control = new DatabaseSync(path.join(staged, "control/settings.sqlite"), {
      readOnly: true,
      allowExtension: false,
    });
    try {
      control.exec("PRAGMA trusted_schema=OFF");
      if (
        control.prepare("PRAGMA user_version").get().user_version !== 1 ||
        control.prepare("PRAGMA journal_mode").get().journal_mode !== "delete" ||
        control.prepare("SELECT count(*) AS count FROM requests").get().count !== 0 ||
        JSON.parse(control.prepare("SELECT value FROM control WHERE key='state'").get().value).phase !== "idle"
      )
        throw Error("Invalid recovery database");
      control.prepare("SELECT action FROM audit LIMIT 1").all();
    } finally {
      control.close();
    }
    const vapid = crypto.createPrivateKey(fs.readFileSync(path.join(staged, "push/vapid.pem")));
    if (vapid.asymmetricKeyType !== "ec" || vapid.asymmetricKeyDetails.namedCurve !== "prime256v1")
      throw Error("Invalid push signing key");
    let revision;
    for (const domain of ["app", "notification"]) {
      const key = fs.readFileSync(path.join(staged, "keys", `${domain}.key`));
      if (key.length !== 32) throw Error("Invalid recovery key");
      const db = new DatabaseSync(path.join(staged, domain, "settings.sqlite"), {
        readOnly: true,
        allowExtension: false,
      });
      try {
        db.exec("PRAGMA trusted_schema=OFF");
        if (
          db.prepare("PRAGMA user_version").get().user_version !== 1 ||
          db.prepare("PRAGMA journal_mode").get().journal_mode !== "delete"
        )
          throw Error("Unsupported system database");
        const record = vault.unseal(
          JSON.parse(db.prepare("SELECT envelope FROM records WHERE slot='active'").get().envelope),
          key,
          domain,
        );
        if (revision !== undefined && record.revision !== revision) throw Error("Vault revisions disagree");
        revision = record.revision;
        if (domain === "app" && record.env.GATHER_EXTERNAL_URL !== manifest.origin)
          throw Error("Backup origin does not match vault");
      } finally {
        db.close();
      }
    }
  }
  return {
    version: manifest.version,
    origin: manifest.origin,
    created: manifest.created,
    files: manifest.files.length,
    bytes: total,
  };
}
function encrypt(manifest, staged, output, key, salt) {
  const iv = crypto.randomBytes(12),
    header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const body = Buffer.from(JSON.stringify(manifest));
  if (body.length > 1048576) throw Error("Backup manifest exceeds the restore metadata limit");
  const fd = fs.openSync(output, "wx", 0o600),
    buffer = Buffer.alloc(65536);
  try {
    writeAll(fd, header);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    for (const chunk of [length, body]) writeAll(fd, cipher.update(chunk));
    for (const entry of manifest.files) {
      const source = fs.openSync(path.join(staged, entry.label, entry.path), "r");
      try {
        let size;
        while ((size = fs.readSync(source, buffer))) writeAll(fd, cipher.update(buffer.subarray(0, size)));
      } finally {
        fs.closeSync(source);
      }
    }
    writeAll(fd, cipher.final());
    writeAll(fd, cipher.getAuthTag());
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (regular(output).size > MAX + 1048576) throw Error("Backup exceeds limit");
}
function decrypt(input, staged, key, expected) {
  const size = regular(input).size;
  if (size < 56 || size > MAX + 1048576) throw Error("Invalid backup size");
  const fd = fs.openSync(input, "r"),
    header = Buffer.alloc(36),
    tag = Buffer.alloc(16);
  const plain = `${staged}.plain`;
  fs.mkdirSync(path.dirname(staged), { recursive: true, mode: 0o700 });
  let out;
  try {
    fs.readSync(fd, header, 0, 36, 0);
    fs.readSync(fd, tag, 0, 16, size - 16);
    if (!header.subarray(0, 8).equals(MAGIC)) throw Error("Invalid backup header");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, header.subarray(24, 36));
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    out = fs.openSync(plain, "wx", 0o600);
    const buffer = Buffer.alloc(65536);
    let position = 36;
    while (position < size - 16) {
      const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - 16 - position), position);
      if (!read) throw Error("Truncated backup");
      writeAll(out, decipher.update(buffer.subarray(0, read)));
      position += read;
    }
    writeAll(out, decipher.final());
    fs.closeSync(out);
    out = undefined;
    // Authenticate the complete archive before inspecting paths or creating restored files.
    const source = fs.openSync(plain, "r");
    try {
      const length = Buffer.alloc(4);
      if (fs.readSync(source, length) !== 4 || length.readUInt32BE() > 1048576) throw Error("Invalid backup manifest");
      const bytes = Buffer.alloc(length.readUInt32BE());
      if (fs.readSync(source, bytes) !== bytes.length) throw Error("Truncated manifest");
      const manifest = JSON.parse(bytes.toString());
      validate(manifest, null, expected);
      const expectedSize = 4 + bytes.length + manifest.files.reduce((sum, entry) => sum + entry.size, 0);
      if (regular(plain).size !== expectedSize) throw Error("Invalid archive length");
      fs.mkdirSync(staged, { mode: 0o700 });
      for (const entry of manifest.files) {
        const target = path.join(staged, entry.label, entry.path);
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        const targetFD = fs.openSync(target, "wx", 0o600);
        try {
          let remaining = entry.size;
          while (remaining) {
            const read = fs.readSync(source, buffer, 0, Math.min(buffer.length, remaining));
            if (!read) throw Error("Truncated entry");
            writeAll(targetFD, buffer.subarray(0, read));
            remaining -= read;
          }
        } finally {
          fs.closeSync(targetFD);
        }
      }
      validate(manifest, staged, expected);
      return manifest;
    } finally {
      fs.closeSync(source);
    }
  } finally {
    if (out !== undefined) fs.closeSync(out);
    fs.closeSync(fd);
    fs.rmSync(plain, { force: true });
  }
}
function restore(manifest, staged, base, expected) {
  validate(manifest, staged, expected);
  const destinations = roots(base);
  // Preflight destinations before touching live data. Mounts and paths are fixed by the controller.
  for (const [label, root] of Object.entries(destinations)) {
    if (fs.lstatSync(root).isSymbolicLink() || !fs.lstatSync(root).isDirectory()) throw Error("Unsafe destination");
    for (const name of walk(root))
      if (["config", "push"].includes(label) || allowed(label, name)) regular(path.join(root, name));
  }
  for (const label of ["config", "push"]) {
    // Runtime output is regenerated by bootstrap; remove stale WAL files along with the database.
    for (const name of fs.readdirSync(destinations[label]))
      fs.rmSync(path.join(destinations[label], name), { recursive: true, force: true });
  }
  for (const label of ["app", "notification", "control"]) {
    for (const suffix of ["", "-wal", "-shm", "-journal"])
      fs.rmSync(path.join(destinations[label], `settings.sqlite${suffix}`), { force: true });
  }
  for (const entry of manifest.files) {
    const target = path.join(destinations[entry.label], entry.path),
      source = path.join(staged, entry.label, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    // Key files are bind mounts: overwrite their contents without replacing the inode.
    if (entry.label === "keys") {
      regular(target);
      fs.writeFileSync(target, fs.readFileSync(source), { mode: 0o600 });
    } else fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o600);
    let parent = path.dirname(target);
    while (parent.startsWith(destinations[entry.label])) {
      const directory = fs.openSync(parent, "r");
      try {
        fs.fsyncSync(directory);
      } finally {
        fs.closeSync(directory);
      }
      if (parent === destinations[entry.label]) break;
      parent = path.dirname(parent);
    }
    const fd = fs.openSync(target, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
}
function execute(
  action,
  jobDirectory = "/maintenance/job",
  base = "/source",
  transportFile = "/maintenance/transport.key",
) {
  const job = JSON.parse(fs.readFileSync(path.join(jobDirectory, "job.json")));
  if (!/^[a-f0-9-]{36}$/.test(job.id) || !["backup", "inspect", "restore", "rollback"].includes(action))
    throw Error("Invalid maintenance operation");
  const transport = fs.readFileSync(transportFile);
  const key = action === "rollback" ? null : Buffer.from(vault.unseal(job.secret, transport, "app").key, "base64");
  const rollbackKey = crypto.createHmac("sha256", transport).update(`rollback:${job.id}`).digest();
  const info = { version: job.version, origin: job.origin };
  const staged = path.join(jobDirectory, `stage-${crypto.randomUUID()}`);
  try {
    if (action === "backup") {
      const manifest = snapshot(base, staged, info);
      encrypt(manifest, staged, path.join(jobDirectory, "backup.gather"), key, Buffer.from(job.salt, "base64"));
      vault.atomicWrite(path.join(jobDirectory, "result.json"), validate(manifest, staged, info));
    } else if (action === "inspect") {
      const manifest = decrypt(path.join(jobDirectory, "upload.gather"), staged, key, info);
      vault.atomicWrite(path.join(jobDirectory, "result.json"), {
        ...validate(manifest, staged, info),
        checksum: hash(path.join(jobDirectory, "upload.gather")),
      });
    } else if (action === "restore") {
      const priorResult = JSON.parse(fs.readFileSync(path.join(jobDirectory, "result.json")));
      if (hash(path.join(jobDirectory, "upload.gather")) !== priorResult.checksum)
        throw Error("Backup changed after inspection");
      const manifest = decrypt(path.join(jobDirectory, "upload.gather"), staged, key, info);
      const before = `${staged}-before`;
      try {
        const original = snapshot(base, before, info);
        encrypt(original, before, path.join(jobDirectory, "rollback.gather"), rollbackKey, crypto.randomBytes(16));
        vault.atomicWrite(path.join(jobDirectory, "restore-started.json"), { started: Date.now() });
        restore(manifest, staged, base, info);
      } finally {
        fs.rmSync(before, { recursive: true, force: true });
      }
    } else {
      const manifest = decrypt(path.join(jobDirectory, "rollback.gather"), staged, rollbackKey, info);
      restore(manifest, staged, base, info);
    }
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
}
module.exports = { MAGIC, MAX, TERMINAL, roots, safe, allowed, snapshot, validate, encrypt, decrypt, restore, execute };
if (require.main === module) {
  try {
    execute(process.argv[2]);
  } catch {
    process.stderr.write("Gather maintenance validation or storage operation failed.\n");
    process.exitCode = 1;
  }
}
