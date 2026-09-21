import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { iconStore, normalizeIcon } from "./icon-store";
const dirs = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
async function fixture() {
  return `data:image/png;base64,${(
    await sharp({ create: { width: 700, height: 350, channels: 4, background: "red" } })
      .png()
      .toBuffer()
  ).toString("base64")}`;
}
describe("uploaded icons", () => {
  it("decodes and resizes images before saving a content-addressed reusable asset", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gather-icons-"));
    dirs.push(directory);
    const store = iconStore(directory),
      data = await fixture();
    const url = await store.save(data);
    expect(await store.save(data)).toBe(url);
    expect(await store.list()).toEqual([url]);
    const buffer = await store.read(url.split("/").at(-1));
    expect(await sharp(buffer).metadata()).toMatchObject({ format: "png", width: 512, height: 256 });
  });
  it("rejects active content, spoofed types, malformed images and oversized inputs", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>').toString("base64");
    for (const data of [
      `data:image/svg+xml;base64,${svg}`,
      `data:image/png;base64,${svg}`,
      "data:image/png;base64,AAAA",
      `data:image/png;base64,${"A".repeat(1400001)}`,
    ])
      await expect(normalizeIcon(data)).rejects.toThrow();
  });
  it("rejects path traversal and symlinks", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gather-icons-"));
    dirs.push(directory);
    const store = iconStore(directory);
    await expect(store.read("../../settings.yaml")).rejects.toThrow("not found");
    await store.list();
    const name = `${"a".repeat(64)}.png`;
    await fs.writeFile(path.join(directory, "secret"), "private");
    await fs.symlink(path.join(directory, "secret"), path.join(directory, ".gather-icons", name));
    await expect(store.read(name)).rejects.toThrow("not found");
  });
});
