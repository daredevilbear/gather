import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getToken } from "next-auth/jwt";

import vault from "../../../../../system/vault.cjs";

import { systemAdministrator, validEditorOrigin } from "utils/gather/admin";
import {
  jobDirectory,
  maintenanceBusy,
  maintenanceDirectory,
  MAX_UPLOAD,
  withMaintenanceLock,
} from "utils/gather/backup-store";
import { ConfigError } from "utils/gather/config-store";
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!(await systemAdministrator(req)))
    return res.status(403).json({ error: "Protected server administrator access required." });
  if (req.method !== "POST") return res.status(405).end();
  if (!validEditorOrigin(req) || req.headers["content-type"] !== "application/octet-stream")
    return res.status(403).json({ error: "Invalid upload request." });
  let directory;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.GATHER_AUTH_SECRET });
    const length = Number(req.headers["content-length"]);
    if (!Number.isSafeInteger(length) || length < 56 || length > MAX_UPLOAD)
      return res.status(413).json({ error: "Choose a Gather backup up to 257 MiB." });
    const id = crypto.randomUUID();
    withMaintenanceLock(() => {
      if (maintenanceBusy()) throw new ConfigError("Another backup or restore is active.", 409);
      if (fs.readdirSync(path.join(maintenanceDirectory(), "jobs")).length >= 10)
        throw new ConfigError("Delete an old backup job first.", 409);
      directory = jobDirectory(id);
      fs.mkdirSync(directory, { mode: 0o700 });
    });
    const disk = fs.statfsSync(directory);
    if (disk.bavail * disk.bsize < length * 4 + 16777216)
      throw new ConfigError("Insufficient free space to validate and recover this restore.", 409);
    const output = await fs.promises.open(path.join(directory, "upload.gather"), "wx", 0o600);
    let received = 0;
    try {
      for await (const chunk of req) {
        received += chunk.length;
        if (received > length) throw new ConfigError("Upload exceeds declared size.", 413);
        await output.write(chunk);
      }
      if (received !== length) throw new ConfigError("Backup upload was interrupted.");
      await output.sync();
    } finally {
      await output.close();
    }
    const created = Date.now();
    vault.atomicWrite(path.join(directory, "upload.json"), { owner: token.sub, created });
    vault.atomicWrite(path.join(directory, "job.json"), {
      id,
      owner: token.sub,
      created,
      phase: "uploaded",
      action: "inspect",
    });
    return res.json({ id });
  } catch (error) {
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
    return res
      .status(error instanceof ConfigError ? error.status : 500)
      .json({ error: error instanceof ConfigError ? error.message : "Backup upload failed." });
  }
}
