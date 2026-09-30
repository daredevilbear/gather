const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
(async () => {
  const root = path.join(__dirname, "..", "public");
  const svg = await fs.readFile(path.join(root, "gather.svg"), "utf8");
  // Installed app icons are opaque squares; the operating system applies its own mask.
  const app = svg.replace('rx="12"', 'rx="0"');
  for (const [name, size] of [
    ["android-chrome-512x512.png", 512], ["android-chrome-192x192.png", 192],
    ["apple-touch-icon.png", 180], ["favicon-32x32.png", 32], ["favicon-16x16.png", 16],
  ]) {
    await sharp(Buffer.from(name.startsWith("favicon") ? svg : app)).resize(size, size).png().toFile(path.join(root, name));
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
