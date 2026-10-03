import { getToken } from "next-auth/jwt";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import viewHandler from "pages/api/gather/dashboard-view";
import handler from "pages/api/gather/workspace";
import { validEditorOrigin } from "utils/gather/admin";
import { workspaceStore } from "utils/gather/dashboard-workspace";
import { userAccess } from "utils/gather/users-store";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("utils/gather/admin", () => ({ validEditorOrigin: vi.fn(() => true) }));
vi.mock("utils/gather/users-store", async (original) => ({
  ...(await original()),
  userAccess: vi.fn(() => ({ enabled: true, role: "editor" })),
  sessionAccess: token => userAccess(token?.sub),
}));
vi.mock("utils/config/config", () => ({ getSettings: () => ({ title: "Shared" }) }));
vi.mock("utils/config/api-response", () => ({
  servicesResponse: async () => [],
  bookmarksResponse: async () => [],
  widgetsResponse: async () => [],
}));
const response = () => {
  const r = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() };
  r.status.mockReturnValue(r);
  return r;
};
let dir;
beforeEach(() => {
  vi.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gather-workspace-api-"));
  vi.stubEnv("GATHER_CONFIG_DIR", dir);
  getToken.mockResolvedValue({ sub: "alice" });
  userAccess.mockReturnValue({ enabled: true, role: "editor" });
  validEditorOrigin.mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});
it("lets editors edit only their own dashboard with revision protection", async () => {
  const initial = response();
  await handler({ method: "GET", query: { file: "settings.yaml", owner: "bob" } }, initial);
  const revision = initial.json.mock.calls[0][0].revision;
  const result = response();
  await handler(
    {
      method: "POST",
      query: {},
      body: { owner: "bob", action: "save", file: "settings.yaml", text: "title: Alice", revision },
    },
    result,
  );
  const store = workspaceStore();
  expect(store.get("alice").documents["settings.yaml"]).toBe("title: Alice");
  expect(store.get("bob")).toBeNull();
  store.close();
  const stale = response();
  await handler(
    { method: "POST", query: {}, body: { action: "save", file: "settings.yaml", text: "title: Stale", revision } },
    stale,
  );
  expect(stale.status).toHaveBeenCalledWith(409);
});
it("shares view-only and rejects revoked or disabled-owner links, including saved selections", async () => {
  await handler({ method: "GET", query: {} }, response());
  const r = response();
  await handler({ method: "POST", query: {}, body: { action: "sharing", enabled: true } }, r);
  const token = r.json.mock.calls[0][0].share;
  getToken.mockResolvedValue({ sub: "bob" });
  const view = response();
  await viewHandler({ method: "GET", query: { dashboard: token } }, view);
  expect(view.json.mock.calls[0][0].view.settings.title).toBe("My dashboard");
  await handler({ method: "POST", query: {}, body: { action: "current", target: token } }, response());
  const store = workspaceStore();
  store.sharing("alice", false);
  store.close();
  const revoked = response();
  await viewHandler({ method: "GET", query: {} }, revoked);
  expect(revoked.status).toHaveBeenCalledWith(404);
  userAccess.mockImplementation((subject) => ({ enabled: subject !== "alice", role: "editor" }));
  const mine = response();
  getToken.mockResolvedValue({ sub: "alice" });
  await viewHandler({ method: "GET", query: { dashboard: "mine" } }, mine);
  expect(mine.status).toHaveBeenCalledWith(403);
});
it("requires authentication and same-origin writes", async () => {
  getToken.mockResolvedValue(null);
  const r = response();
  await handler({ method: "GET", query: {} }, r);
  expect(r.status).toHaveBeenCalledWith(401);
  getToken.mockResolvedValue({ sub: "alice" });
  validEditorOrigin.mockReturnValue(false);
  const cross = response();
  await handler({ method: "POST", query: {}, body: { action: "sharing", enabled: true } }, cross);
  expect(cross.status).toHaveBeenCalledWith(403);
});

it("keeps viewer accounts read-only while allowing a current dashboard preference", async () => {
  userAccess.mockReturnValue({ enabled: true, role: "viewer" });
  const read = response();
  await handler({ method: "GET", query: {} }, read);
  expect(read.json.mock.calls[0][0].canEdit).toBe(false);
  const denied = response();
  await handler({ method: "POST", query: {}, body: { action: "sharing", enabled: true } }, denied);
  expect(denied.status).toHaveBeenCalledWith(403);
  const selected = response();
  await handler({ method: "POST", query: {}, body: { action: "current", target: "shared" } }, selected);
  expect(selected.json.mock.calls[0][0].current).toBe("shared");
});
