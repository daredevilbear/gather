import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import local from "../../../system/local-accounts.cjs";
import { sessionAccess, usersStore } from "./users-store";

let dir, store;
const alice = {
  name: "Alice",
  email: "alice@example.test",
  username: "Alice",
  password: "Alice-long-password",
  role: "editor",
};
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gather-local-"));
  vi.stubEnv("GATHER_CONFIG_DIR", dir);
  vi.stubEnv("GATHER_LOCAL_ACCOUNTS_ENABLED", "true");
  for (const name of [
    "GATHER_OIDC_ISSUER",
    "GATHER_OIDC_CLIENT_ID",
    "GATHER_OIDC_CLIENT_SECRET",
    "GATHER_AUTH_PASSWORD",
  ])
    vi.stubEnv(name, "");
  store = usersStore(dir);
});
afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("stores distinct salted hashes, normalizes usernames, and never exposes credentials", async () => {
  store.addLocal(alice, "Admin");
  store.addLocal({ ...alice, name: "Bob", username: "bob", email: "bob@example.test" }, "Admin");
  const first = await store.authenticate("ALICE", alice.password);
  const second = await store.authenticate("bob", alice.password);
  expect(first.id).not.toBe(second.id);
  expect(first.id).toMatch(/^local:/);
  expect(first.localCredentialVersion).toBe(1);
  expect(store.list().map((user) => user.username)).toEqual(["alice", "bob"]);
  expect(JSON.stringify(store.list())).not.toMatch(/salt|hash|password/);
  const db = new DatabaseSync(path.join(dir, ".gather-users.sqlite"), { readOnly: true });
  const hashes = db.prepare("SELECT hash,salt FROM local_credentials").all();
  db.close();
  expect(hashes[0].hash).not.toBe(hashes[1].hash);
  expect(hashes[0].salt).not.toBe(hashes[1].salt);
  expect(fs.readFileSync(path.join(dir, ".gather-users.sqlite")).includes(Buffer.from(alice.password))).toBe(false);
  expect(fs.statSync(path.join(dir, ".gather-users.sqlite")).mode & 0o777).toBe(0o600);
});
it("rejects invalid credentials, duplicate usernames and short passwords without adding accounts", async () => {
  store.addLocal(alice, "Admin");
  expect(() => store.addLocal({ ...alice, email: "other@example.test", username: "ALICE" }, "Admin")).toThrow(
    "username already",
  );
  expect(() =>
    store.addLocal({ ...alice, email: "other@example.test", username: "bob", password: "short" }, "Admin"),
  ).toThrow("12–1024");
  expect(store.list()).toHaveLength(1);
  for (const username of ["nobody", "' OR 1=1 --", null, "alice"])
    expect(await store.authenticate(username, "wrong-password")).toBeNull();
});
it("locks repeated failures for a minute, then allows the correct password", async () => {
  store.addLocal({ ...alice, username: "lock-test" }, "Admin");
  for (let i = 0; i < 5; i++) expect(await store.authenticate("lock-test", "wrong-password")).toBeNull();
  expect(await store.authenticate("lock-test", alice.password)).toBeNull();
  store.close();
  store = usersStore(dir);
  expect(await store.authenticate("lock-test", alice.password)).toBeNull();
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 61000);
  expect(await store.authenticate("lock-test", alice.password)).toHaveProperty("id");
  vi.restoreAllMocks();
});
it("persists identity, access status and reset credentials when storage is reopened", async () => {
  store.addLocal(alice, "Admin");
  const original = await store.authenticate("alice", alice.password);
  const id = store.list()[0].id;
  store.resetPassword(id, "Replacement-persisted-password", "admin", "Admin");
  store.update(id, { role: "viewer", enabled: false }, "admin", "Admin");
  store.close();
  store = usersStore(dir);
  expect(store.list()[0]).toMatchObject({ id, username: "alice", role: "viewer", enabled: false });
  expect(await store.authenticate("alice", "Replacement-persisted-password")).toBeNull();
  store.update(id, { role: "viewer", enabled: true }, "admin", "Admin");
  expect(await store.authenticate("alice", alice.password)).toBeNull();
  expect(await store.authenticate("alice", "Replacement-persisted-password")).toMatchObject({
    id: original.id,
    localCredentialVersion: 2,
  });
  expect(sessionAccess({ sub: original.id, localCredentialVersion: 1 }, dir).enabled).toBe(false);
});
it.each(["reset", "disable"])("rejects authentication if a %s happens during password verification", async (action) => {
  store.addLocal(alice, "Admin");
  const pending = store.authenticate("alice", alice.password);
  const id = store.list()[0].id;
  if (action === "reset") store.resetPassword(id, "Replacement-race-password", "admin", "Admin");
  else store.update(id, { role: "editor", enabled: false }, "admin", "Admin");
  expect(await pending).toBeNull();
});
it("disabling users and password resets revoke existing sessions", async () => {
  store.addLocal(alice, "Admin");
  const user = await store.authenticate("alice", alice.password);
  const token = { sub: user.id, localCredentialVersion: user.localCredentialVersion };
  const id = store.list()[0].id;
  expect(sessionAccess(token, dir)).toEqual({ role: "editor", enabled: true });
  store.update(id, { role: "editor", enabled: false }, "admin", "Admin");
  expect(await store.authenticate("alice", alice.password)).toBeNull();
  expect(sessionAccess(token, dir).enabled).toBe(false);
  store.update(id, { role: "editor", enabled: true }, "admin", "Admin");
  store.resetPassword(id, "New-long-password", "admin", "Admin");
  expect(sessionAccess(token, dir).enabled).toBe(false);
  expect(await store.authenticate("alice", alice.password)).toBeNull();
  expect((await store.authenticate("alice", "New-long-password")).localCredentialVersion).toBe(2);
});
it("requires the current password for self changes and protects recovery resets", async () => {
  store.addLocal(alice, "Admin");
  const user = await store.authenticate("alice", alice.password);
  vi.stubEnv("GATHER_ADMIN_IDS", user.id);
  expect(() => store.resetPassword(store.list()[0].id, "New-long-password", "other", "Other")).toThrow("protected");
  await expect(store.changePassword(user.id, "wrong-password", "New-long-password")).rejects.toThrow(
    "Current password",
  );
  await store.changePassword(user.id, alice.password, "New-long-password");
  expect(sessionAccess({ sub: user.id, localCredentialVersion: 1 }, dir).enabled).toBe(false);
  expect(await store.authenticate("alice", "New-long-password")).toHaveProperty("id", user.id);
});
it("does not claim pending OIDC roles from unverified local email and blocks local sessions under OIDC", async () => {
  store.add({ name: "Prepared", email: alice.email, role: "admin" }, "Admin");
  // Local identity recognition must not claim this pending external role.
  store.identify({ sub: "local:unprovisioned", name: "Other", email: alice.email, emailVerified: false });
  expect(sessionAccess({ sub: "local:unprovisioned", localCredentialVersion: 1 }, dir).enabled).toBe(false);
  expect(store.list().find((user) => user.name === "Prepared").pending).toBe(true);
  expect(local.localAccountsEnabled({ GATHER_OIDC_ISSUER: "partial" })).toBe(false);
  store.addLocal({ ...alice, email: "local@example.test" }, "Admin");
  const user = await store.authenticate("alice", alice.password);
  const token = { sub: user.id, localCredentialVersion: user.localCredentialVersion };
  expect(sessionAccess(token, dir).enabled).toBe(true);
  vi.stubEnv("GATHER_OIDC_ISSUER", "https://issuer.example.test");
  expect(sessionAccess(token, dir).enabled).toBe(false);
});
