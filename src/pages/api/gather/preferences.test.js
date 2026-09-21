import { beforeEach, expect, it, vi } from "vitest";
import { getToken } from "next-auth/jwt";
import { validEditorOrigin } from "utils/gather/admin";
import { preferencesStore } from "utils/gather/preferences-store";
import handler from "./preferences";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("utils/gather/admin", () => ({ validEditorOrigin: vi.fn() }));
vi.mock("utils/config/config", () => ({ CONF_DIR: "/test" }));
vi.mock("utils/gather/preferences-store", () => ({ preferencesStore: vi.fn() }));
const store = { read: vi.fn(), save: vi.fn(), close: vi.fn() };
function response() { const res = { setHeader: vi.fn(), json: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res); return res; }
beforeEach(() => { vi.clearAllMocks(); preferencesStore.mockReturnValue(store); getToken.mockResolvedValue({ sub: "signed-in" }); validEditorOrigin.mockReturnValue(true); });
it("rejects anonymous requests before opening storage", async () => {
  getToken.mockResolvedValue(null); const res = response();
  await handler({ method: "GET" }, res);
  expect(res.status).toHaveBeenCalledWith(401); expect(preferencesStore).not.toHaveBeenCalled();
});
it("uses the authenticated identity and rejects cross-origin writes", async () => {
  const res = response(); validEditorOrigin.mockReturnValue(false);
  await handler({ method: "POST", body: {widgetsPosition:"above"} }, res);
  expect(res.status).toHaveBeenCalledWith(403); expect(store.save).not.toHaveBeenCalled();
  validEditorOrigin.mockReturnValue(true);
  await handler({ method: "POST", body: {widgetsPosition:"above"} }, response());
  expect(store.save).toHaveBeenCalledWith("signed-in", {widgetsPosition:"above"});
  const invalid = response();
  await handler({ method: "POST", body: {widgetsPosition:"above", owner:"another"} }, invalid);
  expect(invalid.status).toHaveBeenCalledWith(400);
});
