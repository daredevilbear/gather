// Exercise the shipped native binaries without network access or live data.
const assert = require("node:assert/strict");
const fs = require("node:fs");

// The standalone runtime does not install packages. npm's separate dependency
// tree can otherwise retain vulnerable copies outside the application lockfile.
for (const path of ["/usr/local/lib/node_modules/npm", "/usr/local/bin/npm", "/usr/local/bin/npx"]) {
  assert(!fs.existsSync(path), `Unexpected runtime package installer: ${path}`);
}

const [major, minor, patch] = process.versions.node.split(".").map(Number);
assert(major === 22 && (minor > 23 || (minor === 23 && patch >= 4)), `Unpatched Node runtime: ${process.version}`);
console.log(`Patched Node runtime verified: ${process.version}`);

const sharp = require("sharp");

(async () => {
  const png = await sharp({ create: { width: 8, height: 6, channels: 4, background: "#9fe1c6" } })
    .png()
    .toBuffer();
  const webp = await sharp(png).resize(4, 3).webp().toBuffer();
  const metadata = await sharp(webp).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 4);
  assert.equal(metadata.height, 3);
  console.log(`Native image encode/resize/decode passed: sharp ${sharp.versions.sharp}, ${process.arch}`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
