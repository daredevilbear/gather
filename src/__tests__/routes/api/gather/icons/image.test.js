import { getToken } from "next-auth/jwt";
import handler from "pages/api/gather/icons/[name]";
import { iconStore } from "utils/gather/icon-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("utils/config/config", () => ({ CONF_DIR: "/test" }));
vi.mock("utils/env", () => ({ isAuthEnabled: () => true }));
vi.mock("utils/gather/icon-store", () => ({ iconStore: vi.fn() }));
function response() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), send: vi.fn(), end: vi.fn() };
}
beforeEach(() => vi.clearAllMocks());
describe("uploaded icon viewer access", () => {
  it("rejects anonymous viewers before reading disk", async () => {
    getToken.mockResolvedValue(null);
    const res = response();
    await handler({ method: "GET", query: { name: "icon.png" } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(iconStore).not.toHaveBeenCalled();
  });
  it("serves icons to signed-in viewers without requiring administrator privileges", async () => {
    getToken.mockResolvedValue({ sub: "viewer" });
    const bytes = Buffer.from("normalized image");
    iconStore.mockReturnValue({ read: vi.fn().mockResolvedValue(bytes) });
    const res = response();
    await handler({ method: "GET", query: { name: "icon.png" } }, res);
    expect(res.send).toHaveBeenCalledWith(bytes);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
  });
});
