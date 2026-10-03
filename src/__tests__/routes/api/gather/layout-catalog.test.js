import { getToken } from "next-auth/jwt";
import handler from "pages/api/gather/layout-catalog";
import { getSettings } from "utils/config/config";
import { sessionAccess } from "utils/gather/users-store";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("utils/gather/users-store", () => ({ sessionAccess: vi.fn() }));
vi.mock("utils/config/config", () => ({ getSettings: vi.fn() }));
vi.mock("utils/config/api-response", () => ({
  servicesResponse: async () => [{ name: "Home", services: [{ name: "Media", widget: { key: "not returned" } }] }],
  bookmarksResponse: async () => [],
  widgetsResponse: async () => [],
}));
const response = () => {
  const r = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() };
  r.status.mockReturnValue(r);
  return r;
};
beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue({ sub: "alice" });
  sessionAccess.mockReturnValue({ enabled: true });
  getSettings.mockReturnValue({});
});
it("returns names and presentation choices only", async () => {
  const res = response();
  await handler({ method: "GET" }, res);
  expect(res.json.mock.calls[0][0].groups[0].items).toEqual(["Media"]);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain("not returned");
});
it("requires a signed-in enabled user", async () => {
  getToken.mockResolvedValue(null);
  let res = response();
  await handler({ method: "GET" }, res);
  expect(res.status).toHaveBeenCalledWith(401);
  getToken.mockResolvedValue({ sub: "disabled" });
  sessionAccess.mockReturnValue({ enabled: false });
  res = response();
  await handler({ method: "GET" }, res);
  expect(res.status).toHaveBeenCalledWith(403);
});
