import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import database from "../../../system/database.cjs";
import vault from "../../../system/vault.cjs";

import { ConfigError } from "./config-store";
const fail = (m, status = 400) => {
  throw new ConfigError(m, status);
};
const text = (v, max = 2048) => typeof v === "string" && v.length <= max && !/[\r\n\0]/.test(v);
function url(value, httpsOnly = true) {
  try {
    const u = new URL(value);
    if (
      !text(value) ||
      !(httpsOnly ? ["https:"] : ["https:", "http:"]).includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw Error();
    return u;
  } catch {
    fail("Enter a valid URL without credentials, query strings or fragments.");
  }
}
export function state() {
  return database.control(vault.locations().directory, (db) => database.value(db, "state", { phase: "idle" }));
}
export function publicConfig() {
  const app = vault.read("app"),
    notification = vault.read("notification");
  return {
    revision: app.revision,
    status: state(),
    configured: true,
    origin: app.env.HOMEPAGE_EXTERNAL_URL,
    issuer: app.env.HOMEPAGE_OIDC_ISSUER || "",
    clientId: app.env.HOMEPAGE_OIDC_CLIENT_ID || "",
    providerName: app.env.HOMEPAGE_OIDC_NAME || "SSO",
    clientSecretSet: !!app.env.HOMEPAGE_OIDC_CLIENT_SECRET,
    admins: (app.env.GATHER_ADMIN_IDS || "").split(",").filter(Boolean),
    ntfyUrl: notification.env.NTFY_URL,
    ntfyAuthSet: !!notification.env.NTFY_AUTH,
    callbackUrl: app.env.HOMEPAGE_EXTERNAL_URL + "/api/auth/callback/homepage-oidc",
  };
}
export function candidate(input, subject) {
  const app = structuredClone(vault.read("app")),
    notification = structuredClone(vault.read("notification"));
  if (app.revision !== notification.revision) fail("System configuration changed. Reload before editing.", 409);
  if (input.revision !== app.revision) fail("System configuration changed. Reload before editing.", 409);
  if (
    Object.keys(input).some(
      (k) =>
        !["revision", "issuer", "clientId", "clientSecret", "providerName", "admins", "ntfyUrl", "ntfyAuth"].includes(
          k,
        ),
    )
  )
    fail("Unsupported system setting.");
  url(input.issuer);
  url(input.ntfyUrl, false);
  if (
    new URL(input.ntfyUrl).protocol === "http:" &&
    new URL(input.ntfyUrl).origin !== new URL(notification.env.NTFY_URL).origin
  )
    fail("Use HTTPS when configuring a new notification server.");
  for (const key of ["clientId", "providerName"])
    if (!text(input[key], 200) || !input[key].trim()) fail("Client ID and provider name are required.");
  if (
    !Array.isArray(input.admins) ||
    input.admins.length < 1 ||
    input.admins.length > 50 ||
    input.admins.some((id) => !text(id, 200) || !id.trim() || id.includes(",")) ||
    !input.admins.includes(subject)
  )
    fail("Keep your current administrator identity in the allowlist.");
  if (input.clientSecret !== undefined && (!text(input.clientSecret, 8192) || !input.clientSecret))
    fail("A replacement client secret cannot be empty.");
  if (
    input.ntfyAuth !== undefined &&
    (!text(input.ntfyAuth, 8192) || !/^Bearer \S+$|^Basic [A-Za-z0-9+/]+=*$/.test(input.ntfyAuth))
  )
    fail("Use a Bearer token or Basic authorization value.");
  const changedClient =
    input.issuer.replace(/\/+$/, "") !== app.env.HOMEPAGE_OIDC_ISSUER?.replace(/\/+$/, "") ||
    input.clientId !== app.env.HOMEPAGE_OIDC_CLIENT_ID;
  if (changedClient && !input.clientSecret)
    fail("Supply the client secret when changing the OIDC issuer or client ID.");
  if (new URL(input.ntfyUrl).origin !== new URL(notification.env.NTFY_URL).origin && !input.ntfyAuth)
    fail("Supply new credentials when changing the notification server.");
  app.env.HOMEPAGE_OIDC_ISSUER = input.issuer.replace(/\/+$/, "");
  app.env.HOMEPAGE_OIDC_CLIENT_ID = input.clientId;
  app.env.HOMEPAGE_OIDC_NAME = input.providerName;
  app.env.GATHER_ADMIN_IDS = input.admins.join(",");
  if (input.clientSecret) app.env.HOMEPAGE_OIDC_CLIENT_SECRET = input.clientSecret;
  notification.env.NTFY_URL = input.ntfyUrl.replace(/\/+$/, "");
  if (input.ntfyAuth) notification.env.NTFY_AUTH = input.ntfyAuth;
  if (!app.env.HOMEPAGE_OIDC_CLIENT_SECRET || !notification.env.NTFY_AUTH) fail("Connection credentials are required.");
  return { app, notification, baseRevision: app.revision };
}
export async function checkConnections(records) {
  const issuer = records.app.env.HOMEPAGE_OIDC_ISSUER;
  let discovery;
  try {
    const r = await fetch(issuer + "/.well-known/openid-configuration", {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw Error();
    const body = await r.text();
    if (body.length > 100000) throw Error();
    discovery = JSON.parse(body);
    if (discovery.issuer?.replace(/\/+$/, "") !== issuer) throw Error();
    for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"])
      if (url(discovery[key]).origin !== new URL(issuer).origin) throw Error();
  } catch {
    fail("OIDC discovery failed. Check the issuer URL and its HTTPS certificate.");
  }
  try {
    const r = await fetch(records.notification.env.NTFY_URL + "/v1/health", {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw Error();
    // The connection test uses the active non-secret topic preferences.
    let topics = records.notification.env.NTFY_TOPICS;
    const pref = path.join(
      process.env.HOMEPAGE_CONFIG_DIR || path.join(process.cwd(), "config"),
      ".gather-runtime/gather-notifications.json",
    );
    if (fs.existsSync(pref)) topics = JSON.parse(fs.readFileSync(pref, "utf8")).topics || topics;
    if (!/^[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*$/.test(topics)) throw Error();
    const read = await fetch(
      records.notification.env.NTFY_URL + "/" + topics + "/json?poll=1&since=" + Math.floor(Date.now() / 1000),
      {
        headers: { Authorization: records.notification.env.NTFY_AUTH },
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      },
    );
    await read.body?.cancel();
    if (!read.ok) throw Error();
  } catch {
    fail("Notification connection failed. Check the server, credentials and topic permissions.");
  }
  return "OIDC discovery and ntfy authentication passed. The OIDC client secret is verified by a fresh sign-in after applying.";
}
export function stage(records, subject) {
  const p = vault.locations();
  const revision = randomUUID();
  records.app.revision = revision;
  records.notification.revision = revision;
  const request = {
    revision,
    author: subject,
    created: Date.now(),
    app: vault.seal(records.app, fs.readFileSync(p.appKey), "app"),
    notification: vault.seal(records.notification, fs.readFileSync(p.notificationKey), "notification"),
  };
  database.control(
    p.directory,
    (db) =>
      database.transaction(db, () => {
        const status = database.value(db, "state", { phase: "idle" });
        if (["awaiting_confirmation", "applying", "rolling_back"].includes(status.phase))
          fail("A configuration change is already awaiting confirmation.", 409);
        const heartbeat = database.value(db, "heartbeat", 0);
        if (Date.now() - heartbeat > 20000 || heartbeat > Date.now() + 5000)
          fail("The recovery controller is not available. Changes cannot be applied safely.", 503);
        if (db.prepare("SELECT id FROM requests WHERE id=1").get()) fail("Another apply request is queued.", 409);
        // Recheck inside the write transaction: another activation may have completed
        // between connection testing and queuing this request.
        if (vault.read("app").revision !== records.baseRevision)
          fail("System configuration changed. Reload before editing.", 409);
        db.prepare("INSERT INTO requests(id,value) VALUES (1,?)").run(JSON.stringify(request));
      }),
    true,
  );
  return { revision, queued: true };
}
export function confirm(token) {
  return database.control(
    vault.locations().directory,
    (db) =>
      database.transaction(db, () => {
        const status = database.value(db, "state", { phase: "idle" });
        if (status.phase !== "awaiting_confirmation" || status.deadline <= Date.now())
          fail("There is no active confirmation window.", 409);
        if (
          !Number.isInteger(token.gatherLoginAt) ||
          token.gatherLoginRevision !== status.revision ||
          token.gatherLoginAt < Math.floor(status.started / 1000) ||
          process.env.GATHER_SYSTEM_REVISION !== status.revision
        )
          fail("Sign in again through SSO before confirming this change.", 403);
        database.put(db, "confirmed", { revision: status.revision, subject: token.sub });
        return { confirmed: true };
      }),
    true,
  );
}
