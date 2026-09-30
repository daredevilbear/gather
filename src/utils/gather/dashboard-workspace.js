import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { usersDirectory } from "./users-store";

export const DASHBOARD_FILES = ["settings.yaml", "services.yaml", "bookmarks.yaml", "widgets.yaml"];
export function workspaceStore(directory = usersDirectory()) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, ".gather-workspaces.sqlite");
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()))
    throw Error("Invalid storage");
  const db = new DatabaseSync(file, { allowExtension: false });
  fs.chmodSync(file, 0o600);
  db.exec(`PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS workspaces(owner TEXT PRIMARY KEY, documents TEXT NOT NULL, revision INTEGER NOT NULL, share TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS choices(owner TEXT PRIMARY KEY, target TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS versions(owner TEXT NOT NULL, revision INTEGER NOT NULL, documents TEXT NOT NULL, happened TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(owner,revision));`);
  return {
    get(owner) {
      const row = db.prepare("SELECT * FROM workspaces WHERE owner=?").get(owner);
      return row ? { documents: JSON.parse(row.documents), revision: row.revision, share: row.share } : null;
    },
    initialize(owner, documents) {
      db.prepare("INSERT OR IGNORE INTO workspaces VALUES (?,?,1,NULL)").run(owner, JSON.stringify(documents));
      return this.get(owner);
    },
    save(owner, documents, revision) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const old = this.get(owner);
        if (!old || old.revision !== revision) throw Error("This dashboard changed. Reload before saving.");
        db.prepare("INSERT INTO versions(owner,revision,documents) VALUES (?,?,?)").run(
          owner,
          revision,
          JSON.stringify(old.documents),
        );
        db.prepare("UPDATE workspaces SET documents=?,revision=revision+1 WHERE owner=?").run(
          JSON.stringify(documents),
          owner,
        );
        db.prepare("DELETE FROM versions WHERE owner=? AND revision < ?").run(owner, revision - 49);
        db.exec("COMMIT");
        return this.get(owner);
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    backups(owner) {
      return db
        .prepare("SELECT revision AS id,happened AS date FROM versions WHERE owner=? ORDER BY revision DESC LIMIT 50")
        .all(owner)
        .map((row) => ({ id: String(row.id), date: `${row.date.replace(" ", "T")}Z` }));
    },
    version(owner, revision) {
      const row = db
        .prepare("SELECT documents FROM versions WHERE owner=? AND revision=?")
        .get(owner, Number(revision));
      if (!row) throw Error("Backup not found.");
      return JSON.parse(row.documents);
    },
    sharing(owner, enabled) {
      const current = this.get(owner);
      if (!current) throw Error("Dashboard not found");
      const token = enabled ? current.share || randomBytes(24).toString("hex") : null;
      db.prepare("UPDATE workspaces SET share=? WHERE owner=?").run(token, owner);
      return token;
    },
    shared(token) {
      return db.prepare("SELECT owner FROM workspaces WHERE share=?").get(token)?.owner;
    },
    current(owner) {
      return db.prepare("SELECT target FROM choices WHERE owner=?").get(owner)?.target || "shared";
    },
    select(owner, target) {
      db.prepare("INSERT INTO choices VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET target=excluded.target").run(
        owner,
        target,
      );
    },
    close() {
      db.close();
    },
  };
}
