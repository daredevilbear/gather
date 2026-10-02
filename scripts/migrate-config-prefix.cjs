// Offline migration: supply the previous environment prefix explicitly.
// Preview by default. Stop every writer and retain an offline backup before --apply.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const vault = require("../system/vault.cjs");

function migrate(options) {
  const { fromPrefix, configDir, envFile, systemDir, appKeyFile, apply, backupDir } = options;
  if (!/^[A-Z][A-Z0-9]*_$/.test(fromPrefix || "") || fromPrefix === "GATHER_")
    throw Error("Supply a different uppercase --from-prefix ending with an underscore.");
  if (!configDir || !fs.statSync(configDir).isDirectory()) throw Error("Supply --config-dir.");
  const rename = (name) => (name.startsWith(fromPrefix) ? `GATHER_${name.slice(fromPrefix.length)}` : name);
  const replace = (text) => text.replaceAll(`{{${fromPrefix}`, "{{GATHER_");
  const plans = [];
  const databases = [];
  const regularFile = (file) => {
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
      throw Error("Migration requires regular files.");
  };
  function database(file, prepare) {
    if (!fs.existsSync(file)) return;
    regularFile(file);
    const db = new DatabaseSync(file, { readOnly: true, allowExtension: false });
    try {
      db.exec("PRAGMA trusted_schema=OFF;");
      if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
        throw Error("Database integrity check failed.");
      const updates = prepare(db);
      if (updates.length) databases.push({ file, updates });
    } finally {
      db.close();
    }
  }
  for (const name of fs.readdirSync(configDir)) {
    if (!name.endsWith(".yaml")) continue;
    const file = path.join(configDir, name);
    regularFile(file);
    const original = fs.readFileSync(file, "utf8");
    const content = replace(original);
    if (content !== original) plans.push({ file, content });
  }
  if (envFile) {
    regularFile(envFile);
    const original = fs.readFileSync(envFile, "utf8");
    const content = original.replace(
      /^([ \t]*(?:export[ \t]+)?)([A-Z][A-Z0-9_]*)=/gm,
      (_, lead, name) => `${lead}${rename(name)}=`,
    );
    const keys = [...content.matchAll(/^[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
    if (new Set(keys).size !== keys.length) throw Error("Environment migration would create duplicate keys.");
    if (content !== original) plans.push({ file: envFile, content });
  }
  const readKey = () => {
    if (!appKeyFile) throw Error("Encrypted storage requires --app-key-file.");
    regularFile(appKeyFile);
    const key = fs.readFileSync(appKeyFile);
    if (key.length !== 32) throw Error("Invalid app key.");
    return key;
  };
  database(path.join(configDir, ".gather-variables.sqlite"), (db) => {
    const rows = db.prepare("SELECT * FROM variables").all();
    const names = rows.map((row) => rename(row.name));
    if (new Set(names).size !== names.length) throw Error("Variable migration would create duplicate keys.");
    return rows
      .filter((row) => rename(row.name) !== row.name)
      .map((row) => {
        const key = readKey();
        const envelope = JSON.parse(row.envelope);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
        decipher.setAAD(Buffer.from(`gather-variables-v1:${row.name}:${row.kind}`));
        decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
        const value = Buffer.concat([decipher.update(Buffer.from(envelope.body, "base64")), decipher.final()]);
        const name = rename(row.name),
          iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
        cipher.setAAD(Buffer.from(`gather-variables-v1:${name}:${row.kind}`));
        const body = Buffer.concat([cipher.update(value), cipher.final()]);
        const next = JSON.stringify({
          iv: iv.toString("base64"),
          body: body.toString("base64"),
          tag: cipher.getAuthTag().toString("base64"),
        });
        return ["UPDATE variables SET name=?,envelope=? WHERE name=?", [name, next, row.name]];
      });
  });
  database(path.join(configDir, ".gather-users.sqlite"), (db) =>
    db
      .prepare("SELECT owner,body FROM dashboards")
      .all()
      .filter((row) => replace(row.body) !== row.body)
      .map((row) => ["UPDATE dashboards SET body=?,revision=revision+1 WHERE owner=?", [replace(row.body), row.owner]]),
  );
  if (systemDir)
    database(path.join(systemDir, "app/settings.sqlite"), (db) => {
      const key = readKey();
      return db
        .prepare("SELECT slot,envelope FROM records")
        .all()
        .flatMap((row) => {
          const record = vault.unseal(JSON.parse(row.envelope), key, "app");
          const entries = Object.entries(record.env);
          if (!entries.some(([name]) => rename(name) !== name)) return [];
          const names = entries.map(([name]) => rename(name));
          if (new Set(names).size !== names.length) throw Error("System migration would create duplicate keys.");
          const next = { ...record, env: Object.fromEntries(entries.map(([name, value]) => [rename(name), value])) };
          return [
            ["UPDATE records SET envelope=? WHERE slot=?", [JSON.stringify(vault.seal(next, key, "app")), row.slot]],
          ];
        });
    });
  const count = plans.length + databases.length;
  if (!apply || !count) return { files: count, applied: false };
  if (!backupDir) throw Error("--apply requires a new --backup-dir outside the migrated directories.");
  const absoluteBackup = path.resolve(backupDir);
  const realBackup = path.join(fs.realpathSync(path.dirname(absoluteBackup)), path.basename(absoluteBackup));
  for (const directory of [configDir, systemDir].filter(Boolean)) {
    const relative = path.relative(fs.realpathSync(directory), realBackup);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)))
      throw Error("Backup directory must be outside migrated directories.");
  }
  fs.mkdirSync(backupDir, { mode: 0o700 });
  const manifest = [];
  for (const [index, item] of [...plans, ...databases].entries()) {
    const backup = path.join(backupDir, String(index));
    fs.copyFileSync(item.file, backup, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(backup, 0o600);
    for (const suffix of ["-wal", "-shm"]) {
      if (fs.existsSync(item.file + suffix)) {
        regularFile(item.file + suffix);
        fs.copyFileSync(item.file + suffix, backup + suffix, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(backup + suffix, 0o600);
      }
    }
    manifest.push({ original: path.resolve(item.file), backup: String(index) });
  }
  fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  for (const item of plans) {
    const mode = fs.statSync(item.file).mode & 0o777;
    vault.atomicWrite(item.file, item.content, mode);
  }
  for (const item of databases) {
    const db = new DatabaseSync(item.file, { allowExtension: false });
    try {
      db.exec("PRAGMA trusted_schema=OFF; BEGIN IMMEDIATE;");
      for (const [sql, params] of item.updates) db.prepare(sql).run(...params);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    } finally {
      db.close();
    }
  }
  return { files: count, applied: true };
}
if (require.main === module) {
  try {
    const { values } = require("node:util").parseArgs({
      options: {
        "from-prefix": { type: "string" },
        "config-dir": { type: "string" },
        "env-file": { type: "string" },
        "system-dir": { type: "string" },
        "app-key-file": { type: "string" },
        "backup-dir": { type: "string" },
        apply: { type: "boolean", default: false },
      },
    });
    const result = migrate({
      fromPrefix: values["from-prefix"],
      configDir: values["config-dir"],
      envFile: values["env-file"],
      systemDir: values["system-dir"],
      appKeyFile: values["app-key-file"],
      backupDir: values["backup-dir"],
      apply: values.apply,
    });
    console.log(
      `${result.files} files ${result.applied ? "migrated; retain the backup and original keys" : "would change; no files modified"}.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { migrate };
