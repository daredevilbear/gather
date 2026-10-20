import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { validMobileProfile, validMobileTarget } from "./mobile-layout";

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
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !Object.keys(value).length ||
        Object.keys(value).some((key) => !["widgetsPosition", "mobileProfile"].includes(key)) ||
        ("widgetsPosition" in value && !["above", "below"].includes(value.widgetsPosition)) ||
        ("mobileProfile" in value &&
          (!value.mobileProfile ||
            Object.keys(value.mobileProfile).sort().join(",") !== "profile,target" ||
            !validMobileTarget(value.mobileProfile.target) ||
            !validMobileProfile(value.mobileProfile.profile)))
      )
        throw Error("Invalid preferences");
      const prior = this.read(owner);
      const next = { ...prior, ...("widgetsPosition" in value ? { widgetsPosition: value.widgetsPosition } : {}) };
      if (value.mobileProfile) {
        const { target, profile } = value.mobileProfile;
        next.mobileProfiles = { ...prior.mobileProfiles, [target]: profile };
        if (Object.keys(next.mobileProfiles).length > 50) throw Error("Too many mobile profiles");
      }
      db.prepare("INSERT INTO preferences VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET body=excluded.body").run(
        owner,
        JSON.stringify(next),
      );
      return this.read(owner);
    },
    close() {
      db.close();
    },
  };
}
