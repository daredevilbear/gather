import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { getToken } from "next-auth/jwt";

import { systemAdministrator, validEditorOrigin } from "utils/gather/admin";
import { backupAction, jobDirectory, listBackups, queueBackup, readJob } from "utils/gather/backup-store";
import { ConfigError } from "utils/gather/config-store";
export const config = { api: { bodyParser: { sizeLimit: "8kb" }, responseLimit: false } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!(await systemAdministrator(req)))
    return res.status(403).json({ error: "Protected server administrator access required." });
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.GATHER_AUTH_SECRET });
    if (req.method === "GET") {
      if (!req.query.download) return res.json(listBackups(token.sub));
      const job = readJob(req.query.download);
      if (job.owner !== token.sub || job.action !== "backup" || job.phase !== "complete")
        return res.status(404).json({ error: "Backup unavailable." });
      const file = path.join(jobDirectory(job.id), "backup.gather");
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="gather-${job.version}-${job.id}.gather"`);
      res.setHeader("Content-Length", fs.statSync(file).size);
      return await pipeline(fs.createReadStream(file), res);
    }
    if (req.method !== "POST") return res.status(405).end();
    if (!validEditorOrigin(req)) return res.status(403).json({ error: "Invalid request origin." });
    const { action, password, id } = req.body || {};
    return res.json(
      ["backup", "inspect"].includes(action)
        ? queueBackup(action, password, token.sub, id)
        : backupAction(action, id, token),
    );
  } catch (error) {
    if (!res.headersSent)
      return res
        .status(error instanceof ConfigError ? error.status : 500)
        .json({
          error:
            error instanceof ConfigError
              ? error.message
              : "Backup operation unavailable. Check storage and controller mounts.",
        });
  }
}
