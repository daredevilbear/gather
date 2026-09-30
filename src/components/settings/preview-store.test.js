import { describe, expect, it } from "vitest";
import { createPreviewStore } from "./preview-store";

describe("local settings preview", () => {
  it("isolates edits, rejects stale saves, and restores local backups", async () => {
    const request = createPreviewStore();
    const original = await request(null, "settings.yaml");
    const saved = await request({
      action: "save",
      file: original.file,
      revision: original.revision,
      text: "title: Changed\n",
    });
    expect(saved.text).toContain("Changed");
    await expect(
      request({ action: "save", file: original.file, revision: original.revision, text: "title: Stale\n" }),
    ).rejects.toThrow(/changed/);
    const restored = await request({
      action: "restore",
      file: saved.file,
      revision: saved.revision,
      backup: saved.backups[0].id,
    });
    expect(restored.text).toBe(original.text);
    expect((await createPreviewStore()(null, "settings.yaml")).text).toBe(original.text);
  });
});
