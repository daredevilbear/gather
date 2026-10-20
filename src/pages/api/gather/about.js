import fs from "node:fs";
import path from "node:path";

import database from "../../../../system/database.cjs";
import vault from "../../../../system/vault.cjs";

import { workspaceIdentity } from "utils/gather/workspace-identity";
function source(file) {
  for (const root of ["/usr/share/gather", process.cwd()]) {
    try {
      return fs.readFileSync(path.join(root, file), "utf8");
    } catch {
      /* Next location. */
    }
  }
  return "";
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    await workspaceIdentity(req);
    if (req.method !== "GET") return res.status(405).end();
    let controller = null;
    if (process.env.GATHER_SYSTEM_DIR) {
      try {
        controller = database.control(vault.locations().directory, (db) => ({
          ...database.value(db, "controller", {}),
          heartbeat: database.value(db, "heartbeat", null),
        }));
      } catch {
        /* Report unavailable without leaking storage errors. */
      }
    }
    const build = process.env.NEXT_PUBLIC_VERSION || "development";
    return res.json({
      app: {
        version: source("VERSION").trim() || "unknown",
        build,
        revision: process.env.NEXT_PUBLIC_REVISION || "unknown",
        channel: /^(v?\d+\.\d+\.\d+|latest)$/.test(build) ? "production" : "development",
      },
      controller,
      notes: source("CHANGELOG.md").slice(0, 14000),
      releases: "https://github.com/daredevilbear/gather/releases",
    });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ error: error.status ? error.message : "Version information unavailable." });
  }
}
