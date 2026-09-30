import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DEFAULT_PREFERENCES = { widgetsPosition: "below" };

export function preferencesStore(directory) {
  const file = path.join(directory, ".gather-preferences.sqlite");
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()))
    throw Error("Preference storage is unavailable");
  const db = new DatabaseSync(file, { allowExtension: false });
  fs.chmodSync(file, 0o600);
  db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;");
  db.exec("CREATE TABLE IF NOT EXISTS preferences (owner TEXT PRIMARY KEY, body TEXT NOT NULL)");
  return {
    read(owner) {
      const row = db.prepare("SELECT body FROM preferences WHERE owner=?").get(owner);
      return { ...DEFAULT_PREFERENCES, ...(row ? JSON.parse(row.body) : {}) };
    },
    save(owner, value) {
      if (!value || Object.keys(value).some((key) => key !== "widgetsPosition") ||
        !["above", "below"].includes(value.widgetsPosition)) throw Error("Invalid preferences");
      db.prepare("INSERT INTO preferences VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET body=excluded.body")
        .run(owner, JSON.stringify(value));
      return this.read(owner);
    },
    close() { db.close(); },
  };
}
