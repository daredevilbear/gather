import { getToken } from "next-auth/jwt";

import { administrator, validEditorOrigin } from "utils/gather/admin";
import { ConfigError } from "utils/gather/config-store";
import { candidate, checkConnections, confirm, publicConfig, stage } from "utils/gather/system-store";
export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!(await administrator(req))) return res.status(403).json({ error: "Administrator access required." });
  if (!process.env.GATHER_SYSTEM_DIR)
    return res
      .status(409)
      .json({
        error:
          "Secure system storage is not installed. Ask the operator to initialize the vault and recovery controller.",
      });
  try {
    if (req.method === "GET") return res.json(publicConfig());
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    if (!validEditorOrigin(req)) return res.status(403).json({ error: "Invalid origin." });
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.HOMEPAGE_AUTH_SECRET });
    if (req.body?.action === "confirm") return res.json(confirm(token));
    if (!["test", "apply"].includes(req.body?.action)) throw new ConfigError("Unsupported operation.");
    const records = candidate(req.body.config, token.sub);
    const message = await checkConnections(records);
    if (req.body.action === "test") return res.json({ message });
    return res.json(stage(records, token.sub));
  } catch (e) {
    return res
      .status(e instanceof ConfigError ? e.status : 500)
      .json({
        error:
          e instanceof ConfigError
            ? e.message
            : "System configuration could not be processed. No secrets were returned; check vault mounts and the controller.",
      });
  }
}
