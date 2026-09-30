import handler from "pages/api/gather/icons/index";
import { administrator, validEditorOrigin } from "utils/gather/admin";
import { iconStore } from "utils/gather/icon-store";
import { workspaceIdentity } from "utils/gather/workspace-identity";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("utils/gather/workspace-identity", () => ({ workspaceIdentity: vi.fn() }));
vi.mock("utils/config/config", () => ({ CONF_DIR: "/test" }));
vi.mock("utils/gather/admin", () => ({ administrator: vi.fn(), validEditorOrigin: vi.fn() }));
vi.mock("utils/gather/icon-store", () => ({ iconStore: vi.fn() }));
function response() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn() };
}
beforeEach(() => {
  vi.clearAllMocks();
  workspaceIdentity.mockRejectedValue(Error("Sign in"));
});
describe("icon upload authorization", () => {
  it("denies reads and uploads to signed-out users before accessing storage", async () => {
    administrator.mockResolvedValue(false);
    for (const method of ["GET", "POST"]) {
      const res = response();
      await handler({ method }, res);
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(iconStore).not.toHaveBeenCalled();
  });
  it("denies uploads from another origin", async () => {
    administrator.mockResolvedValue(true);
    validEditorOrigin.mockReturnValue(false);
    const save = vi.fn();
    iconStore.mockReturnValue({ save });
    const res = response();
    await handler({ method: "POST", body: { image: "sample" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(save).not.toHaveBeenCalled();
  });
  it("accepts an authorized same-origin upload", async () => {
    administrator.mockResolvedValue(true);
    validEditorOrigin.mockReturnValue(true);
    const save = vi.fn().mockResolvedValue("/api/gather/icons/icon.png");
    iconStore.mockReturnValue({ save });
    const res = response();
    await handler({ method: "POST", body: { image: "sample" } }, res);
    expect(save).toHaveBeenCalledWith("sample");
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

it("allows editors to upload icons for their own dashboard", async () => {
  administrator.mockResolvedValue(false);
  workspaceIdentity.mockResolvedValue({ subject: "alice", role: "editor" });
  validEditorOrigin.mockReturnValue(true);
  const save = vi.fn().mockResolvedValue("/api/gather/icons/icon.png");
  iconStore.mockReturnValue({ save });
  const res = response();
  await handler({ method: "POST", body: { image: "sample" } }, res);
  expect(res.status).toHaveBeenCalledWith(201);
});
