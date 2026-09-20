import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import * as yaml from "js-yaml";

export const FILES = [
  "settings.yaml",
  "services.yaml",
  "bookmarks.yaml",
  "widgets.yaml",
  "custom.css",
  "custom.js",
  "gather-notifications.json",
];
export const hash = (text) => createHash("sha256").update(text).digest("hex");
export class ConfigError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const fail = (message) => {
  throw new ConfigError(message);
};
const single = (x) => object(x) && Object.keys(x).length === 1 && Object.keys(x)[0].trim();
function safeTree(x, depth = 0, seen = new Set()) {
  if (depth > 30) fail("Configuration nesting exceeds 30 levels.");
  if (!x || typeof x !== "object") return;
  if (seen.has(x)) fail("YAML aliases and recursive references are not supported by the editor.");
  seen.add(x);
  for (const [k, v] of Object.entries(x)) {
    if (["__proto__", "prototype", "constructor"].includes(k)) fail("Reserved property name.");
    safeTree(v, depth + 1, seen);
  }
}
function groups(value, kind) {
  if (!Array.isArray(value)) fail(`${kind} must be a list of groups.`);
  const names = new Set();
  function visit(group, depth) {
    if (!single(group) || depth > 15) fail("Each group must have one nonempty name.");
    const [name, entries] = Object.entries(group)[0];
    if (depth === 0 && names.has(name)) fail("Group names must be unique.");
    if (depth === 0) names.add(name);
    if (!Array.isArray(entries)) fail(`Group ${name} must contain a list.`);
    entries.forEach((entry) => {
      if (!single(entry)) fail("Each entry must have one nonempty name.");
      const detail = Object.values(entry)[0];
      if (kind === "Services" && Array.isArray(detail)) visit(entry, depth + 1);
      else if (kind === "Bookmarks") {
        if (!Array.isArray(detail) || detail.some((v) => !object(v)))
          fail("Bookmark details must be a list of objects.");
      } else if (!object(detail)) fail("Service details must be an object.");
    });
  }
  value.forEach((g) => visit(g, 0));
}
export function validate(file, text) {
  if (!FILES.includes(file)) fail("Unsupported configuration file.");
  if (typeof text !== "string" || Buffer.byteLength(text) > 512 * 1024)
    fail("Configuration must be text smaller than 512 KiB.");
  if (file.endsWith(".css") || file.endsWith(".js")) return text;
  let value;
  try {
    value = file.endsWith(".json") ? JSON.parse(text) : yaml.load(text, { schema: yaml.JSON_SCHEMA });
  } catch {
    fail("Invalid YAML or JSON. Check syntax before saving.");
  }
  safeTree(value);
  if (file === "settings.yaml") {
    if (!object(value)) fail("Settings must be an object.");
    if (value.layout !== undefined && !object(value.layout) && !Array.isArray(value.layout))
      fail("Layout must be an object or list.");
    if (value.gather !== undefined && !object(value.gather)) fail("Gather settings must be an object.");
    for (const field of ["accountMenu", "notifications"])
      if (value.gather?.[field] !== undefined && typeof value.gather[field] !== "boolean")
        fail(`${field} must be a checkbox value.`);
    const url = value.gather?.accountSettingsUrl;
    if (url) {
      try {
        const u = new URL(url);
        if (u.protocol !== "https:" || u.username || u.password) throw Error();
      } catch {
        fail("Account settings must use an HTTPS URL without credentials.");
      }
    }
  }
  if (file === "services.yaml") groups(value, "Services");
  if (file === "bookmarks.yaml") groups(value, "Bookmarks");
  if (
    file === "widgets.yaml" &&
    (!Array.isArray(value) || value.some((v) => !single(v) || !object(Object.values(v)[0])))
  )
    fail("Widgets must be a list of named widget objects.");
  if (file === "gather-notifications.json") {
    if (!object(value) || Object.keys(value).some((k) => !["topics", "appName", "icon"].includes(k)))
      fail("Only topics, appName and icon can be configured here.");
    if (
      value.topics !== undefined &&
      (typeof value.topics !== "string" || !/^[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*$/.test(value.topics))
    )
      fail("Topics must be comma-separated names using letters, numbers, underscores or hyphens.");
    if (
      value.appName !== undefined &&
      (typeof value.appName !== "string" || !value.appName.trim() || value.appName.length > 80)
    )
      fail("App name must contain 1–80 characters.");
    if (
      value.icon !== undefined &&
      (typeof value.icon !== "string" || !/^\/(?!\/)[A-Za-z0-9_./-]+$/.test(value.icon) || value.icon.includes(".."))
    )
      fail("Icon must be a same-origin image path, for example /images/logo.png.");
  }
  return value;
}
export function createStore(directory) {
  const backupDir = path.join(directory, ".gather-backups");
  const filePath = (file) => {
    if (!FILES.includes(file)) fail("Unsupported configuration file.");
    return path.join(directory, ...(file === "gather-notifications.json" ? [".gather-runtime", file] : [file]));
  };
  async function read(file) {
    const target = filePath(file);
    try {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) fail("Configuration must be a regular file.");
      if (stat.size > 512 * 1024) fail("File is too large for the editor.");
      return await fs.readFile(target, "utf8");
    } catch (e) {
      if (e.code === "ENOENT")
        return file === "gather-notifications.json"
          ? "{}\n"
          : file.endsWith(".yaml")
            ? file === "settings.yaml"
              ? "{}\n"
              : "[]\n"
            : "";
      throw e;
    }
  }
  async function document(file) {
    const text = await read(file);
    return { file, text, revision: hash(text) };
  }
  async function backups(file) {
    filePath(file);
    try {
      const names = await fs.readdir(backupDir);
      return names
        .filter((id) => id.startsWith(`${file}--`) && /^[a-zA-Z0-9_.-]+$/.test(id))
        .sort()
        .reverse()
        .slice(0, 50)
        .map((id) => ({ id, date: new Date(Number(id.split("--")[1])).toISOString() }));
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  async function save(file, text, revision, restore) {
    filePath(file);
    await fs.mkdir(directory, { recursive: true });
    let lock;
    try {
      lock = await fs.open(path.join(directory, ".gather-editor.lock"), "wx", 0o600);
    } catch (e) {
      if (e.code === "EEXIST")
        throw new ConfigError(
          "Another save is in progress. Retry shortly; if it persists, ask the operator to inspect the editor lock.",
          409,
        );
      throw e;
    }
    let temporary;
    try {
      const before = await read(file);
      if (typeof revision !== "string" || hash(before) !== revision)
        throw new ConfigError("This file changed since you opened it. Reload the file and reapply your changes.", 409);
      if (restore) {
        if (typeof restore !== "string" || !restore.startsWith(`${file}--`) || !/^[a-zA-Z0-9_.-]+$/.test(restore))
          fail("Invalid backup.");
        text = await fs.readFile(path.join(backupDir, restore), "utf8");
      }
      validate(file, text);
      await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
      const backup = `${file}--${Date.now()}--${randomUUID()}`;
      await fs.writeFile(path.join(backupDir, backup), before, { flag: "wx", mode: 0o600 });
      temporary = path.join(directory, `.gather-${randomUUID()}.tmp`);
      const handle = await fs.open(temporary, "wx", file === "gather-notifications.json" ? 0o644 : 0o600);
      try {
        await handle.writeFile(text);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.mkdir(path.dirname(filePath(file)), { recursive: true, mode: 0o755 });
      await fs.rename(temporary, filePath(file));
      return { file, text, revision: hash(text), backup };
    } finally {
      if (temporary) await fs.unlink(temporary).catch(() => {});
      await lock.close();
      await fs.unlink(path.join(directory, ".gather-editor.lock"));
    }
  }
  return { document, backups, save };
}
