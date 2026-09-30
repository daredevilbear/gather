import handler from "pages/api/gather/system";
import { administrator, validEditorOrigin } from "utils/gather/admin";
import { publicConfig, stage } from "utils/gather/system-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("utils/gather/admin", () => {
  const admin = vi.fn();
  return { administrator: admin, systemAdministrator: admin, validEditorOrigin: vi.fn() };
});
vi.mock("utils/gather/system-store", () => ({
  candidate: vi.fn(),
  checkConnections: vi.fn(),
  confirm: vi.fn(),
  publicConfig: vi.fn(),
  stage: vi.fn(),
}));
function response() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
}
beforeEach(() => {
  vi.clearAllMocks();
});
describe("embedded system authorization", () => {
  it("rejects unauthorized direct access independently of navigation visibility", async () => {
    administrator.mockResolvedValue(false);
    for (const method of ["GET", "POST"]) {
      const res = response();
      await handler({ method, body: { action: "apply" } }, res);
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(publicConfig).not.toHaveBeenCalled();
    expect(stage).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes by administrators", async () => {
    vi.stubEnv("GATHER_SYSTEM_DIR", "/test");
    try {
      administrator.mockResolvedValue(true);
      validEditorOrigin.mockReturnValue(false);
      const res = response();
      await handler({ method: "POST", body: { action: "apply" } }, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(stage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
