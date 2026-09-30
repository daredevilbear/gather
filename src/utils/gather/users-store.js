import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const usersDirectory = () => process.env.HOMEPAGE_CONFIG_DIR || path.join(process.cwd(), "config");
export const bootstrapAdmin = (subject) =>
  Boolean(
    subject &&
    (process.env.GATHER_ADMIN_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .includes(subject),
  );
export function userAccess(subject, directory = usersDirectory()) {
  if (bootstrapAdmin(subject)) return { role: "admin", enabled: true };
  const file = path.join(directory, ".gather-users.sqlite");
  if (!subject || !fs.existsSync(file)) return { role: "viewer", enabled: true };
  const db = new DatabaseSync(file, { readOnly: true, allowExtension: false });
  try {
    db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;");
    const row = db.prepare("SELECT role,enabled FROM users WHERE subject=?").get(subject);
    return row ? { role: row.role, enabled: Boolean(row.enabled) } : { role: "viewer", enabled: true };
  } finally {
    db.close();
  }
}
export function usersStore(directory = usersDirectory()) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, ".gather-users.sqlite");
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()))
    throw Error("Invalid user storage");
  const db = new DatabaseSync(file, { allowExtension: false });
  fs.chmodSync(file, 0o600);
  db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;");
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, subject TEXT UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL,
    role TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_seen TEXT);
    CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, happened TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dashboards (owner TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);`);
  const log = (actor, action, target) => {
    db.prepare("INSERT INTO activity(actor,action,target,happened) VALUES (?,?,?,?)").run(
      actor,
      action,
      target,
      new Date().toISOString(),
    );
    db.exec("DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 1000)");
  };
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  const publicUser = (row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: bootstrapAdmin(row.subject) ? "admin" : row.role,
    enabled: bootstrapAdmin(row.subject) || Boolean(row.enabled),
    pending: !row.subject,
    protected: bootstrapAdmin(row.subject),
    lastSeen: row.last_seen,
  });
  return {
    identify({ sub, name, email, emailVerified = false }, signIn = false) {
      if (typeof sub !== "string" || !sub) throw Error("Missing identity");
      const displayName =
        typeof name === "string" && name.trim() && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(name.trim())
          ? name.trim().slice(0, 120)
          : typeof email === "string" && email
            ? email.slice(0, 254)
            : "Gather user";
      const address = typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : "";
      return transaction(() => {
        let row = db.prepare("SELECT * FROM users WHERE subject=?").get(sub);
        if (!row && emailVerified === true && address) {
          row = db.prepare("SELECT * FROM users WHERE subject IS NULL AND email=?").get(address);
          if (row) db.prepare("UPDATE users SET subject=? WHERE id=?").run(sub, row.id);
        }
        if (!row) {
          const id = randomUUID();
          db.prepare("INSERT INTO users(id,subject,name,email,role,enabled) VALUES (?,?,?,?,?,1)").run(
            id,
            sub,
            displayName,
            address,
            "viewer",
          );
          row = db.prepare("SELECT * FROM users WHERE id=?").get(id);
        }
        db.prepare("UPDATE users SET name=?,email=?,last_seen=? WHERE id=?").run(
          displayName,
          address,
          new Date().toISOString(),
          row.id,
        );
        if (signIn) log(displayName, "Signed in", displayName);
        return publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(row.id));
      });
    },
    list() {
      return db.prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE").all().map(publicUser);
    },
    activity() {
      return db.prepare("SELECT actor,action,target,happened FROM activity ORDER BY id DESC LIMIT 100").all();
    },
    add({ name, email, role }, actor) {
      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 120 ||
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        !["viewer", "editor", "admin"].includes(role)
      )
        throw Error("Enter a name, email and valid role.");
      return transaction(() => {
        const address = email.trim().toLowerCase();
        if (db.prepare("SELECT id FROM users WHERE email=?").get(address))
          throw Error("A user with this email already exists.");
        db.prepare("INSERT INTO users(id,name,email,role,enabled) VALUES (?,?,?,?,1)").run(
          randomUUID(),
          name.trim(),
          address,
          role,
        );
        log(actor, "Added user", name.trim());
      });
    },
    update(id, { role, enabled }, actorSubject, actorName) {
      if (!["viewer", "editor", "admin"].includes(role) || typeof enabled !== "boolean")
        throw Error("Choose a valid role and access status.");
      const row = db.prepare("SELECT * FROM users WHERE id=?").get(id);
      if (!row) throw Error("User not found.");
      if (bootstrapAdmin(row.subject)) throw Error("This administrator is protected by the server configuration.");
      if (row.subject === actorSubject) throw Error("Ask another administrator to change your own access.");
      db.prepare("UPDATE users SET role=?,enabled=? WHERE id=?").run(role, Number(enabled), id);
      log(actorName, `Set ${role} access · ${enabled ? "enabled" : "disabled"}`, row.name);
    },
    dashboard(owner) {
      const row = db.prepare("SELECT body,revision FROM dashboards WHERE owner=?").get(owner);
      return row
        ? { dashboard: JSON.parse(row.body), revision: row.revision }
        : { dashboard: { title: "My dashboard", links: [] }, revision: 0 };
    },
    saveDashboard(owner, dashboard, revision, actorName) {
      return transaction(() => {
        const current = this.dashboard(owner);
        if (current.revision !== revision) throw Error("This dashboard changed. Reload before saving.");
        db.prepare(
          "INSERT INTO dashboards VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET body=excluded.body,revision=excluded.revision",
        ).run(owner, JSON.stringify(dashboard), revision + 1);
        log(actorName, "Updated personal dashboard", actorName);
        return this.dashboard(owner);
      });
    },
    close() {
      db.close();
    },
  };
}
