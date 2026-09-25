import { CONF_DIR } from "utils/config/config";
import { administrator, validEditorOrigin } from "utils/gather/admin";
import { ConfigError } from "utils/gather/config-store";
import { iconStore } from "utils/gather/icon-store";
import { workspaceIdentity } from "utils/gather/workspace-identity";

export const config = { api: { bodyParser: { sizeLimit: "1400kb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!(await administrator(req))) {
    try {
      const actor = await workspaceIdentity(req);
      if (!["editor", "admin"].includes(actor.role)) throw Error("Editor access required");
    } catch {
      return res.status(403).json({ error: "Sign in with an enabled Gather account to manage icons." });
    }
  }
  try {
    const store = iconStore(CONF_DIR);
    if (req.method === "GET") return res.json({ icons: await store.list() });
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).end();
    }
    if (!validEditorOrigin(req)) return res.status(403).json({ error: "Invalid request origin." });
    return res.status(201).json({ url: await store.save(req.body?.image) });
  } catch (e) {
    return res
      .status(e instanceof ConfigError ? e.status : 500)
      .json({ error: e instanceof ConfigError ? e.message : "Could not store this icon." });
  }
}
