import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import database from "../../../system/database.cjs";
import initializer from "../../../system/initialize-quickstart.cjs";
import vault from "../../../system/vault.cjs";
import { usersStore } from "./users-store";

let root;
const localInput = {
  GATHER_DOMAIN: "gather.test.local",
  GATHER_LOCAL_ADMIN_USERNAME: "admin",
  GATHER_LOCAL_ADMIN_PASSWORD: "Test-administrator-password",
};
const owner = { uid: process.getuid(), gid: process.getgid() };
const initialize = (input) => initializer.initialize(root, input, vault.seal, owner);
const read = () =>
  vault.unseal(
    database.envelope(path.join(root, "system-data"), "app"),
    fs.readFileSync(path.join(root, "keys/app.key")),
    "app",
  );
beforeEach(() => {
  vi.spyOn(process, "umask").mockReturnValue(0o077);
  root = fs.mkdtempSync(path.join(os.tmpdir(), "gather-local-init-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});
it("initializes a protected local administrator with no OIDC settings and no plaintext password", async () => {
  initialize(localInput);
  const record = read();
  expect(record.env.GATHER_LOCAL_ACCOUNTS_ENABLED).toBe("true");
  expect(record.env.GATHER_ADMIN_IDS).toMatch(/^local:/);
  expect(Object.keys(record.env)).not.toContain("GATHER_OIDC_ISSUER");
  expect(JSON.stringify(record)).not.toContain(localInput.GATHER_LOCAL_ADMIN_PASSWORD);
  vi.stubEnv("GATHER_ADMIN_IDS", record.env.GATHER_ADMIN_IDS);
  const store = usersStore(path.join(root, "config"));
  try {
    expect(await store.authenticate("admin", localInput.GATHER_LOCAL_ADMIN_PASSWORD)).toHaveProperty(
      "id",
      record.env.GATHER_ADMIN_IDS,
    );
    expect(store.list()[0]).toMatchObject({ protected: true, role: "admin", pending: false });
  } finally {
    store.close();
    vi.unstubAllEnvs();
  }
  for (const file of ["system-data/app/settings.sqlite", "config/.gather-users.sqlite"]) {
    expect(fs.readFileSync(path.join(root, file)).includes(Buffer.from(localInput.GATHER_LOCAL_ADMIN_PASSWORD))).toBe(
      false,
    );
    expect(fs.statSync(path.join(root, file)).mode & 0o777).toBe(0o600);
  }
});
it("retains credentials on rerun and refuses missing local account storage", () => {
  initialize(localInput);
  const files = [
    "keys/app.key",
    "keys/notification.key",
    "system-data/app/settings.sqlite",
    "config/.gather-users.sqlite",
  ];
  const digest = () =>
    files.map((file) =>
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, file)))
        .digest("hex"),
    );
  const before = digest();
  initialize({ ...localInput, GATHER_LOCAL_ADMIN_PASSWORD: "Other-administrator-password" });
  expect(digest()).toEqual(before);
  fs.unlinkSync(path.join(root, "config/.gather-users.sqlite"));
  expect(() => initialize(localInput)).toThrow("Partial initialization");
});
it.each(["GATHER_OIDC_ISSUER", "GATHER_OIDC_CLIENT_ID", "GATHER_OIDC_CLIENT_SECRET"])(
  "rejects partial OIDC %s before writing state",
  (field) => {
    expect(() => initialize({ ...localInput, [field]: "partial-setting" })).toThrow("incomplete");
    expect(fs.readdirSync(root)).toEqual([]);
  },
);
it("requires an operator-supplied local password and prefers complete OIDC", () => {
  expect(() => initialize({ GATHER_DOMAIN: localInput.GATHER_DOMAIN })).toThrow("12–1024");
  expect(fs.readdirSync(root)).toEqual([]);
  initialize({
    ...localInput,
    GATHER_OIDC_ISSUER: "https://identity.test.local",
    GATHER_OIDC_CLIENT_ID: "gather",
    GATHER_OIDC_CLIENT_SECRET: "client-secret",
    GATHER_ADMIN_IDS: "oidc-admin",
  });
  expect(read().env).toMatchObject({ GATHER_OIDC_CLIENT_ID: "gather", GATHER_ADMIN_IDS: "oidc-admin" });
  expect(read().env.GATHER_LOCAL_ACCOUNTS_ENABLED).toBeUndefined();
  expect(fs.existsSync(path.join(root, "config/.gather-users.sqlite"))).toBe(false);
});
