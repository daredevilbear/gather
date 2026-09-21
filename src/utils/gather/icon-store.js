import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { ConfigError } from "./config-store";

export const ICON_NAME = /^[a-f0-9]{64}\.png$/;
export async function normalizeIcon(data) {
  if (
    typeof data !== "string" ||
    data.length > 1400000 ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data)
  )
    throw new ConfigError("Choose a PNG, JPEG or WebP image up to 1 MB.");
  const input = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
  if (input.length > 1024 * 1024) throw new ConfigError("Images must be smaller than 1 MB.");
  try {
    const decoder = sharp(input, { limitInputPixels: 16777216, failOn: "warning" });
    const metadata = await decoder.metadata();
    if (
      !["png", "jpeg", "webp"].includes(metadata.format) ||
      (metadata.pages || 1) > 1 ||
      metadata.width > 4096 ||
      metadata.height > 4096
    )
      throw Error();
    // Decode and re-encode; never serve the uploaded bytes or embedded metadata.
    return await decoder.rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw new ConfigError(
      "This image could not be decoded. Use a still PNG, JPEG or WebP image up to 4096 × 4096 pixels.",
    );
  }
}
export function iconStore(directory) {
  const root = path.join(directory, ".gather-icons");
  async function ensure() {
    await fs.mkdir(root, { recursive: true, mode: 0o750 });
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ConfigError("Icon storage is unavailable.");
  }
  return {
    async list() {
      await ensure();
      return (await fs.readdir(root)).filter((name) => ICON_NAME.test(name)).map((name) => `/api/gather/icons/${name}`);
    },
    async save(data) {
      const buffer = await normalizeIcon(data);
      await ensure();
      const name = `${createHash("sha256").update(buffer).digest("hex")}.png`;
      try {
        await fs.writeFile(path.join(root, name), buffer, { flag: "wx", mode: 0o640 });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
      return `/api/gather/icons/${name}`;
    },
    async read(name) {
      if (!ICON_NAME.test(name || "")) throw new ConfigError("Icon not found.", 404);
      await ensure();
      const target = path.join(root, name);
      try {
        const stat = await fs.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink()) throw Error();
        return await fs.readFile(target);
      } catch {
        throw new ConfigError("Icon not found.", 404);
      }
    },
  };
}
