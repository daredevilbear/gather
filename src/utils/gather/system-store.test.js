import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import database from "../../../system/database.cjs";
import vault from "../../../system/vault.cjs";
import { candidate, checkConnections, confirm, publicConfig, stage } from "./system-store";
let dir, key, notifyKey;
const original = {
  revision: "initial",
  env: {
    GATHER_EXTERNAL_URL: "https://gather.example.test",
    GATHER_OIDC_ISSUER: "https://id.example.test/realm",
    GATHER_OIDC_CLIENT_ID: "gather",
    GATHER_OIDC_CLIENT_SECRET: "super-secret",
    GATHER_OIDC_NAME: "SSO",
    GATHER_ADMIN_IDS: "admin",
    GATHER_AUTH_SECRET: "session-secret",
  },
};
const notifications = {
  revision: "initial",
  env: { NTFY_URL: "https://ntfy.example.test", NTFY_AUTH: "Bearer private-token", NTFY_TOPICS: "apps" },
};
const input = {
  revision: "initial",
  issuer: "https://id.example.test/realm",
  clientId: "gather",
  providerName: "SSO",
  admins: ["admin"],
  ntfyUrl: "https://ntfy.example.test",
};
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gather-vault-"));
  key = crypto.randomBytes(32);
  notifyKey = crypto.randomBytes(32);
  fs.writeFileSync(path.join(dir, "app.key"), key);
  fs.writeFileSync(path.join(dir, "notification.key"), notifyKey);
  vi.stubEnv("GATHER_SYSTEM_DIR", dir);
  vi.stubEnv("GATHER_APP_KEY_FILE", path.join(dir, "app.key"));
  vi.stubEnv("GATHER_NOTIFICATION_KEY_FILE", path.join(dir, "notification.key"));
  execFileSync(
    "python3",
    [
      "-c",
      "import sys,json;sys.path.insert(0,'system');from database import initialize;initialize(sys.argv[1],json.load(sys.stdin))",
      dir,
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      input: JSON.stringify({
        app: vault.seal(original, key, "app"),
        notification: vault.seal(notifications, notifyKey, "notification"),
      }),
    },
  );
  database.control(dir, (db) => database.put(db, "heartbeat", Date.now()), true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});
describe("encrypted system configuration", () => {
  it("reports the running callback selection for encrypted and environment-based deployments", () => {
    expect(publicConfig()).toMatchObject({
      oidcProviderId: "gather-oidc",
      callbackUrl: "https://gather.example.test/api/auth/callback/gather-oidc",
    });
    vi.stubEnv("GATHER_OIDC_PROVIDER_ID", "gather-oidc");
    expect(publicConfig()).toMatchObject({
      oidcProviderId: "gather-oidc",
      callbackUrl: "https://gather.example.test/api/auth/callback/gather-oidc",
    });
  });

  it("encrypts authenticated records and rejects tampering, wrong keys and domains", () => {
    const encrypted = vault.seal(original, key, "app");
    expect(JSON.stringify(encrypted)).not.toContain("super-secret");
    expect(vault.unseal(encrypted, key, "app")).toEqual(original);
    expect(() => vault.unseal(encrypted, notifyKey, "app")).toThrow();
    expect(() => vault.unseal(encrypted, key, "notification")).toThrow();
    encrypted.body = Buffer.from("tampered").toString("base64");
    expect(() => vault.unseal(encrypted, key, "app")).toThrow();
  });
  it("never returns secret values and preserves secrets left unchanged", () => {
    const visible = JSON.stringify(publicConfig());
    expect(visible).not.toContain("super-secret");
    expect(visible).not.toContain("private-token");
    expect(visible).not.toContain("session-secret");
    const next = candidate(input, "admin");
    expect(next.app.env.GATHER_OIDC_CLIENT_SECRET).toBe("super-secret");
    expect(next.notification.env.NTFY_AUTH).toBe("Bearer private-token");
  });
  it("rejects lockouts, stale revisions and credential reuse across destinations", () => {
    expect(() => candidate({ ...input, admins: ["someone-else"] }, "admin")).toThrow();
    expect(() => candidate({ ...input, revision: "stale" }, "admin")).toThrow();
    expect(() => candidate({ ...input, issuer: "https://another.example.test" }, "admin")).toThrow();
    expect(() => candidate({ ...input, ntfyUrl: "https://another.example.test" }, "admin")).toThrow();
    expect(() => candidate({ ...input, issuer: "http://insecure.example.test" }, "admin")).toThrow();
  });
  it("queues only ciphertext and requires the recovery controller heartbeat", () => {
    const next = candidate(input, "admin");
    const queued = stage(next, "admin");
    expect(queued.queued).toBe(true);
    const request = database.control(dir, (db) => db.prepare("SELECT value FROM requests WHERE id=1").get().value);
    expect(request).not.toContain("super-secret");
    expect(request).not.toContain("private-token");
    expect(() => stage(candidate(input, "admin"), "admin")).toThrow();
    database.control(
      dir,
      (db) => {
        db.exec("DELETE FROM requests");
        database.put(db, "heartbeat", 0);
      },
      true,
    );
    expect(() => stage(candidate(input, "admin"), "admin")).toThrow();
  });
  it("requires a fresh login through the newly activated revision to confirm", () => {
    const started = Date.now() - 2000;
    database.control(
      dir,
      (db) =>
        database.put(db, "state", {
          phase: "awaiting_confirmation",
          revision: "next",
          started,
          deadline: Date.now() + 100000,
        }),
      true,
    );
    vi.stubEnv("GATHER_SYSTEM_REVISION", "next");
    expect(() =>
      confirm({ sub: "admin", gatherLoginRevision: "old", gatherLoginAt: Math.floor(Date.now() / 1000) }),
    ).toThrow();
    expect(() => confirm({ sub: "admin", gatherLoginRevision: "next", gatherLoginAt: 0 })).toThrow();
    expect(
      confirm({ sub: "admin", gatherLoginRevision: "next", gatherLoginAt: Math.floor(Date.now() / 1000) }),
    ).toEqual({ confirmed: true });
  });
});

it("checks ntfy using a supported numeric since cursor", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          issuer: input.issuer,
          authorization_endpoint: input.issuer + "/auth",
          token_endpoint: input.issuer + "/token",
          jwks_uri: input.issuer + "/keys",
        }),
    })
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: true, body: { cancel: vi.fn() } });
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("GATHER_CONFIG_DIR", dir);
  await checkConnections(candidate(input, "admin"));
  expect(fetcher.mock.calls[2][0]).toMatch(/poll=1&since=\d+$/);
});

it("fails closed for missing or unsupported databases without a legacy fallback", () => {
  database.control(dir, (db) => db.exec("PRAGMA user_version=999"), true);
  expect(() => publicConfig()).toThrow();
  fs.unlinkSync(path.join(dir, "app/settings.sqlite"));
  expect(() => vault.read("app")).toThrow();
});
it("keeps secrets out of database pages and rejects modified ciphertext", () => {
  for (const domain of ["app", "notification", "control"]) {
    const bytes = fs.readFileSync(path.join(dir, domain, "settings.sqlite"));
    for (const secret of ["super-secret", "private-token", "session-secret"])
      expect(bytes.includes(Buffer.from(secret))).toBe(false);
  }
  const db = database.open(path.join(dir, "app/settings.sqlite"), false);
  const envelope = database.envelope(dir, "app");
  envelope.tag = Buffer.alloc(16).toString("base64");
  db.prepare("UPDATE records SET envelope=? WHERE slot='active'").run(JSON.stringify(envelope));
  db.close();
  expect(() => vault.read("app")).toThrow();
});
it("rejects a queued candidate when the active revision changed during connection testing", () => {
  const next = candidate(input, "admin");
  const db = database.open(path.join(dir, "app/settings.sqlite"), false);
  db.prepare("UPDATE records SET envelope=? WHERE slot='active'").run(
    JSON.stringify(vault.seal({ ...original, revision: "changed" }, key, "app")),
  );
  db.close();
  expect(() => stage(next, "admin")).toThrow(/changed/);
  expect(database.control(dir, (db) => db.prepare("SELECT count(*) AS n FROM requests").get().n)).toBe(0);
});

it("rejects a mixed-revision snapshot during concurrent activation", () => {
  const db = database.open(path.join(dir, "notification/settings.sqlite"), false);
  db.prepare("UPDATE records SET envelope=? WHERE slot='active'").run(
    JSON.stringify(vault.seal({ ...notifications, revision: "concurrent" }, notifyKey, "notification")),
  );
  db.close();
  expect(() => candidate(input, "admin")).toThrow(/changed/);
});

it("supports local-account system changes without OIDC discovery or secret disclosure", async () => {
  const localRecord = {
    ...original,
    env: {
      GATHER_EXTERNAL_URL: original.env.GATHER_EXTERNAL_URL,
      GATHER_LOCAL_ACCOUNTS_ENABLED: "true",
      GATHER_ADMIN_IDS: "local:admin",
      GATHER_AUTH_SECRET: "session-secret",
    },
  };
  const db = database.open(path.join(dir, "app/settings.sqlite"), false);
  db.prepare("UPDATE records SET envelope=? WHERE slot='active'").run(
    JSON.stringify(vault.seal(localRecord, key, "app")),
  );
  db.close();
  expect(publicConfig()).toMatchObject({ localLogin: true, issuer: "", clientSecretSet: false });
  expect(JSON.stringify(publicConfig())).not.toContain("session-secret");
  const localInput = { ...input, issuer: "", clientId: "", admins: ["local:admin"] };
  const next = candidate(localInput, "local:admin");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: true, body: { cancel: vi.fn() } });
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("GATHER_CONFIG_DIR", dir);
  expect(await checkConnections(next)).toContain("Local accounts");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][0]).toBe(input.ntfyUrl + "/v1/health");
  expect(() => candidate({ ...localInput, admins: ["another"] }, "local:admin")).toThrow("current administrator");
  expect(() => candidate({ ...localInput, issuer: input.issuer }, "local:admin")).toThrow("local accounts");
});
