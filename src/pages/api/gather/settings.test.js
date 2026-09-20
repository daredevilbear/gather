import { administrator, validEditorOrigin } from "utils/gather/admin";
import { createStore } from "utils/gather/config-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./settings";
vi.mock("utils/gather/admin", () => ({ administrator: vi.fn(), validEditorOrigin: vi.fn() }));
vi.mock("utils/config/config", () => ({ CONF_DIR: "/test" }));
vi.mock("utils/gather/config-store", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, createStore: vi.fn() };
});
function response() {
  const res = { setHeader: vi.fn(), json: vi.fn(), status: vi.fn(), revalidate: vi.fn().mockResolvedValue() };
  res.status.mockReturnValue(res);
  return res;
}
afterEach(() => vi.clearAllMocks());
describe("settings API", () => {
  it("rejects unauthorized readers before accessing config files", async () => {
    administrator.mockResolvedValue(false);
    const res = response();
    await handler({ method: "GET", query: { file: "settings.yaml" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(createStore).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
  it("rejects cross-origin save attempts even for administrators", async () => {
    administrator.mockResolvedValue(true);
    validEditorOrigin.mockReturnValue(false);
    const save = vi.fn();
    createStore.mockReturnValue({ save });
    const res = response();
    await handler({ method: "POST", body: { action: "save" } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(save).not.toHaveBeenCalled();
  });
  it("saves through the versioned store then revalidates dashboard props", async () => {
    administrator.mockResolvedValue(true);
    validEditorOrigin.mockReturnValue(true);
    const save = vi.fn().mockResolvedValue({ revision: "next" });
    createStore.mockReturnValue({ save, backups: vi.fn().mockResolvedValue([]) });
    const res = response();
    await handler(
      { method: "POST", body: { action: "save", file: "settings.yaml", text: "title: Test", revision: "old" } },
      res,
    );
    expect(save).toHaveBeenCalledWith("settings.yaml", "title: Test", "old", undefined);
    expect(res.revalidate).toHaveBeenCalledWith("/");
    expect(res.json).toHaveBeenCalledWith({ revision: "next", backups: [], applied: true });
  });
  it("validates source without mutating any files", async () => {
    administrator.mockResolvedValue(true);
    validEditorOrigin.mockReturnValue(true);
    const save = vi.fn();
    createStore.mockReturnValue({ save });
    const res = response();
    await handler(
      { method: "POST", body: { action: "validate", file: "widgets.yaml", text: "- greeting: {text: Hello}" } },
      res,
    );
    expect(save).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ valid: true });
  });
});
