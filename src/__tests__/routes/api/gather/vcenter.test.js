import handler from "pages/api/gather/vcenter";
import { systemAdministrator, validEditorOrigin } from "utils/gather/admin";
import { vcenterConnections, vcenterInventory } from "utils/gather/vcenter";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("utils/gather/admin", () => ({ systemAdministrator: vi.fn(), validEditorOrigin: vi.fn() }));
vi.mock("utils/gather/vcenter", () => ({ vcenterConnections: vi.fn(), vcenterInventory: vi.fn() }));
const response = () => {
  const r = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() };
  r.status.mockReturnValue(r);
  return r;
};
beforeEach(() => {
  vi.clearAllMocks();
  systemAdministrator.mockResolvedValue(true);
  validEditorOrigin.mockReturnValue(true);
  vcenterConnections.mockResolvedValue({ lab: { url: "https://vc.test", password: "secret" } });
});
it("lists names without exposing connection values", async () => {
  const res = response();
  await handler({ method: "GET" }, res);
  expect(res.json).toHaveBeenCalledWith({ instances: ["lab"] });
});
it("denies non-server administrators and cross-origin inventory requests", async () => {
  systemAdministrator.mockResolvedValue(false);
  let res = response();
  await handler({ method: "GET" }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  systemAdministrator.mockResolvedValue(true);
  validEditorOrigin.mockReturnValue(false);
  res = response();
  await handler({ method: "POST", body: { instance: "lab" } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(vcenterInventory).not.toHaveBeenCalled();
});
it("rejects arbitrary request URLs and inherited connection names", async () => {
  for (const instance of ["https://evil.test", "constructor"]) {
    const res = response();
    await handler({ method: "POST", body: { instance } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  }
  expect(vcenterInventory).not.toHaveBeenCalled();
});
