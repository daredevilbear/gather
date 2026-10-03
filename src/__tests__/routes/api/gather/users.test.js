import { getToken } from "next-auth/jwt";
import handler from "pages/api/gather/users";
import { administrator, validEditorOrigin } from "utils/gather/admin";
import { usersStore } from "utils/gather/users-store";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("utils/gather/admin", () => ({ administrator: vi.fn(), validEditorOrigin: vi.fn() }));
vi.mock("utils/gather/users-store", () => ({ usersStore: vi.fn(), localAccountsEnabled: () => false }));
const store = {
  identify: vi.fn(() => ({ name: "Admin" })),
  list: vi.fn(() => []),
  activity: vi.fn(() => []),
  add: vi.fn(),
  update: vi.fn(),
  close: vi.fn(),
};
function response() {
  const r = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  r.status.mockReturnValue(r);
  return r;
}
beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue({ sub: "admin" });
  administrator.mockResolvedValue(true);
  validEditorOrigin.mockReturnValue(true);
  usersStore.mockReturnValue(store);
});
it("denies viewers and cross-origin permission changes", async () => {
  administrator.mockResolvedValue(false);
  const denied = response();
  await handler({ method: "GET" }, denied);
  expect(denied.status).toHaveBeenCalledWith(403);
  expect(usersStore).not.toHaveBeenCalled();
  administrator.mockResolvedValue(true);
  validEditorOrigin.mockReturnValue(false);
  const csrf = response();
  await handler({ method: "POST", body: { action: "add" } }, csrf);
  expect(csrf.status).toHaveBeenCalledWith(403);
  expect(store.add).not.toHaveBeenCalled();
});
it("attributes permission changes to the authenticated administrator", async () => {
  await handler(
    { method: "POST", body: { action: "update", id: "user", role: "editor", enabled: true, actor: "forged" } },
    response(),
  );
  expect(store.update).toHaveBeenCalledWith("user", expect.objectContaining({ role: "editor" }), "admin", "Admin");
});
