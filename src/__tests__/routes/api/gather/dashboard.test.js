import { getToken } from "next-auth/jwt";
import handler, { validDashboard } from "pages/api/gather/dashboard";
import { validEditorOrigin } from "utils/gather/admin";
import { sessionAccess, usersStore } from "utils/gather/users-store";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("utils/gather/admin", () => ({ validEditorOrigin: vi.fn() }));
vi.mock("utils/gather/users-store", () => ({ sessionAccess: vi.fn(), usersStore: vi.fn() }));
const store = {
  identify: vi.fn(() => ({ name: "Alice", enabled: true, role: "editor" })),
  dashboard: vi.fn(),
  saveDashboard: vi.fn(),
  close: vi.fn(),
};
const response = () => {
  const r = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  r.status.mockReturnValue(r);
  return r;
};
beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue({ sub: "alice" });
  sessionAccess.mockReturnValue({ role: "editor", enabled: true });
  validEditorOrigin.mockReturnValue(true);
  usersStore.mockReturnValue(store);
});
it("uses the signed-in subject regardless of a requested owner", async () => {
  await handler({ method: "GET", query: { owner: "bob" } }, response());
  expect(store.dashboard).toHaveBeenCalledWith("alice");
});
it("rejects viewer writes, disabled access and cross-origin writes", async () => {
  for (const [access, origin] of [
    [{ role: "viewer", enabled: true }, true],
    [{ role: "editor", enabled: false }, true],
    [{ role: "editor", enabled: true }, false],
  ]) {
    sessionAccess.mockReturnValue(access);
    validEditorOrigin.mockReturnValue(origin);
    const r = response();
    await handler({ method: "POST", body: {} }, r);
    expect(r.status).toHaveBeenCalledWith(403);
  }
  expect(store.saveDashboard).not.toHaveBeenCalled();
});
it("rejects script URLs and credentials in personal links", () => {
  const link = { name: "Test", url: "https://example.test", description: "", tab: "Home" };
  expect(validDashboard({ title: "Test", links: [link] })).toBe(true);
  for (const url of ["javascript:alert(1)", "https://user:pass@example.test"]) {
    expect(validDashboard({ title: "Test", links: [{ ...link, url }] })).toBe(false);
  }
});
it("accepts presentation-only layouts and rejects credentials or owner fields", () => {
  const dashboard = { title: "Mine", links: [], layout: { tabs: ["Home"], groups: [], widgets: [] } };
  expect(validDashboard(dashboard)).toBe(true);
  expect(validDashboard({ ...dashboard, owner: "bob" })).toBe(false);
  expect(validDashboard({ ...dashboard, layout: { ...dashboard.layout, credentials: {} } })).toBe(false);
});
