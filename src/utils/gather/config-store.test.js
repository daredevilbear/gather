import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStore, hash, validate } from "./config-store";
const dirs = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gather-settings-"));
  dirs.push(dir);
  return { dir, store: createStore(dir) };
}
describe("configuration editor store", () => {
  it("preserves unresolved placeholders and saves/restores with version checks", async () => {
    const { store } = await setup();
    const first = await store.document("services.yaml");
    const text =
      '- Home:\n    - Test:\n        href: https://example.test\n        widget:\n          key: "{{HOMEPAGE_VAR_KEY}}"\n';
    const saved = await store.save("services.yaml", text, first.revision);
    expect((await store.document("services.yaml")).text).toBe(text);
    expect(saved.revision).toBe(hash(text));
    await expect(store.save("services.yaml", "[]\n", first.revision)).rejects.toMatchObject({ status: 409 });
    const restored = await store.save("services.yaml", null, saved.revision, saved.backup);
    expect(restored.text).toBe(first.text);
    expect((await store.backups("services.yaml")).length).toBe(2);
  });
  it("rejects traversal, symlinks, invalid syntax and malformed layouts", async () => {
    const { dir, store } = await setup();
    await expect(store.document("../auth.env")).rejects.toThrow("Unsupported");
    await fs.symlink("/etc/passwd", path.join(dir, "custom.js"));
    await expect(store.document("custom.js")).rejects.toThrow("regular file");
    expect(() => validate("services.yaml", "hello")).toThrow();
    expect(() => validate("settings.yaml", "gather: [broken]")).toThrow();
    expect(() => validate("bookmarks.yaml", '- Group: [{Site: [{href: "https://example.test"}]}]')).not.toThrow();
    expect(() => validate("widgets.yaml", "- search: {provider: google}")).not.toThrow();
    expect(() => validate("settings.yaml", "thing: &a {loop: *a}")).toThrow();
    expect(() => validate("settings.yaml", "__proto__: {admin: true}")).toThrow();
  });
  it("serializes concurrent saves so one stale writer cannot overwrite another", async () => {
    const { store } = await setup();
    const doc = await store.document("settings.yaml");
    const results = await Promise.allSettled([
      store.save("settings.yaml", "title: First\n", doc.revision),
      store.save("settings.yaml", "title: Second\n", doc.revision),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")[0].reason.status).toBe(409);
  });
  it("validates notification overrides and blocks server/credential overrides", () => {
    expect(() =>
      validate(
        "gather-notifications.json",
        JSON.stringify({ topics: "apps,health", appName: "Gather", icon: "/images/logo.png" }),
      ),
    ).not.toThrow();
    for (const value of [
      { topics: "a/b" },
      { icon: "https://evil.test/x" },
      { icon: "//evil.test/x" },
      { url: "http://ntfy" },
      { token: "secret" },
    ])
      expect(() => validate("gather-notifications.json", JSON.stringify(value))).toThrow();
  });
  it("creates a rollback copy before replacing a file and rejects wrong-file backups", async () => {
    const { dir, store } = await setup();
    const doc = await store.document("custom.css");
    const saved = await store.save("custom.css", "body { color: red; }", doc.revision);
    expect(await fs.readFile(path.join(dir, ".gather-backups", saved.backup), "utf8")).toBe(doc.text);
    await expect(store.save("custom.css", "", saved.revision, "settings.yaml--123--abc")).rejects.toThrow();
  });
});
