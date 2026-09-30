import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { userAccess, usersStore } from "./users-store";

let dir, store;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gather-users-"));
  store = usersStore(dir);
});
afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("binds prepared roles only to a verified email identity", () => {
  store.add({ name: "Alice", email: "alice@example.test", role: "editor" }, "Admin");
  store.identify({ sub: "unverified", name: "Other", email: "alice@example.test", emailVerified: false });
  expect(userAccess("unverified", dir).role).toBe("viewer");
  store.identify({ sub: "verified", name: "Alice", email: "alice@example.test", emailVerified: true }, true);
  expect(userAccess("verified", dir).role).toBe("editor");
  expect(store.activity().some((event) => event.actor === "Alice" && event.action === "Signed in")).toBe(true);
  expect(store.list().find((user) => user.name === "Alice").pending).toBe(false);
});
it("protects configured administrators and self-access while allowing reversible disable", () => {
  vi.stubEnv("GATHER_ADMIN_IDS", "bootstrap");
  const admin = store.identify({ sub: "bootstrap", name: "Admin" });
  const user = store.identify({ sub: "user", name: "Member" });
  expect(() => store.update(admin.id, { role: "viewer", enabled: false }, "someone", "Someone")).toThrow("protected");
  expect(() => store.update(user.id, { role: "admin", enabled: true }, "user", "Member")).toThrow("own access");
  store.update(user.id, { role: "editor", enabled: false }, "bootstrap", "Admin");
  expect(userAccess("user", dir)).toEqual({ role: "editor", enabled: false });
});
it("isolates personal dashboard data and rejects stale writes", () => {
  const dashboard = { title: "Alice's dashboard", links: [] };
  store.saveDashboard("alice", dashboard, 0, "Alice");
  expect(store.dashboard("bob")).toEqual({ dashboard: { title: "My dashboard", links: [] }, revision: 0 });
  expect(() => store.saveDashboard("alice", { title: "Stale", links: [] }, 0, "Alice")).toThrow("changed");
  expect(store.dashboard("alice").dashboard).toEqual(dashboard);
});
