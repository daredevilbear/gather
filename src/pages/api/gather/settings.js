import { CONF_DIR } from "utils/config/config";
import { administrator, systemAdministrator, validEditorOrigin } from "utils/gather/admin";
import { ConfigError, createStore, FILES, validate } from "utils/gather/config-store";

export const config = { api: { bodyParser: { sizeLimit: "600kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!(await administrator(req)))
    return res.status(403).json({ error: "Dashboard settings require an explicitly authorized administrator." });
  const store = createStore(CONF_DIR);
  const capabilities = { system: await systemAdministrator(req) };
  try {
    if (req.method === "GET") {
      if (!req.query.file) return res.json({ administrator: true, files: FILES, capabilities });
      const doc = await store.document(req.query.file);
      return res.json({ ...doc, capabilities, backups: await store.backups(req.query.file) });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!validEditorOrigin(req)) return res.status(403).json({ error: "Invalid request origin." });
    const { action, file, text, revision, backup } = req.body || {};
    if (action === "validate") {
      validate(file, text);
      return res.json({ valid: true });
    }
    if (action !== "save" && action !== "restore") throw new ConfigError("Unsupported action.");
    if (action === "restore" && !backup) throw new ConfigError("Choose a backup to restore.");
    const result = await store.save(file, text, revision, action === "restore" ? backup : undefined);
    let applied = true;
    try {
      await res.revalidate("/");
    } catch {
      applied = false;
    }
    return res.json({ ...result, capabilities, backups: await store.backups(file), applied });
  } catch (e) {
    return res.status(e instanceof ConfigError ? e.status : 500).json({
      error:
        e instanceof ConfigError ? e.message : "Could not update configuration. Check server permissions and logs.",
    });
  }
}
