import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vault from "../../../system/vault.cjs";
import { candidate, checkConnections, confirm, publicConfig, stage } from "./system-store";
let dir, key, notifyKey;
const original = {
  revision: "initial",
  env: {
    HOMEPAGE_EXTERNAL_URL: "https://gather.example.test",
    HOMEPAGE_OIDC_ISSUER: "https://id.example.test/realm",
    HOMEPAGE_OIDC_CLIENT_ID: "gather",
    HOMEPAGE_OIDC_CLIENT_SECRET: "super-secret",
    HOMEPAGE_OIDC_NAME: "SSO",
    GATHER_ADMIN_IDS: "admin",
    HOMEPAGE_AUTH_SECRET: "session-secret",
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
  vault.atomicWrite(path.join(dir, "app/active.enc"), vault.seal(original, key, "app"));
  vault.atomicWrite(path.join(dir, "notification/active.enc"), vault.seal(notifications, notifyKey, "notification"));
  fs.mkdirSync(path.join(dir, "control"));
  fs.writeFileSync(path.join(dir, "control/heartbeat"), "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});
describe("encrypted system configuration", () => {
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
    expect(next.app.env.HOMEPAGE_OIDC_CLIENT_SECRET).toBe("super-secret");
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
    const request = fs.readFileSync(path.join(dir, "control/request.json"), "utf8");
    expect(request).not.toContain("super-secret");
    expect(request).not.toContain("private-token");
    expect(() => stage(candidate(input, "admin"), "admin")).toThrow();
    fs.unlinkSync(path.join(dir, "control/request.json"));
    fs.utimesSync(path.join(dir, "control/heartbeat"), new Date(0), new Date(0));
    expect(() => stage(candidate(input, "admin"), "admin")).toThrow();
  });
  it("requires a fresh login through the newly activated revision to confirm", () => {
    const started = Date.now() - 2000;
    vault.atomicWrite(path.join(dir, "control/state.json"), {
      phase: "awaiting_confirmation",
      revision: "next",
      started,
      deadline: Date.now() + 100000,
    });
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
  vi.stubEnv("HOMEPAGE_CONFIG_DIR", dir);
  await checkConnections(candidate(input, "admin"));
  expect(fetcher.mock.calls[2][0]).toMatch(/poll=1&since=\d+$/);
});
