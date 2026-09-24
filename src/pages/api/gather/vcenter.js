import { systemAdministrator, validEditorOrigin } from "utils/gather/admin";
import { vcenterConnections, vcenterInventory } from "utils/gather/vcenter";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!(await systemAdministrator(req)))
    return res.status(403).json({ error: "Server administrator access is required." });
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }
  if (req.method === "POST" && !validEditorOrigin(req))
    return res.status(403).json({ error: "Invalid request origin." });
  try {
    const connections = await vcenterConnections();
    if (req.method === "GET") return res.json({ instances: Object.keys(connections) });
    const name = req.body?.instance;
    if (typeof name !== "string" || !Object.hasOwn(connections, name))
      return res.status(400).json({ error: "Select a configured vCenter connection." });
    return res.json({ machines: await vcenterInventory(connections[name]) });
  } catch {
    return res.status(502).json({
      error:
        "Could not read vCenter. Check the HTTPS certificate, server reachability, service account and read-only inventory permissions.",
    });
  }
}
