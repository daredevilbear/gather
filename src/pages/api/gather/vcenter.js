import { systemAdministrator, validEditorOrigin } from "utils/gather/admin";
import { vcenterConnections, vcenterHosts, vcenterInventory } from "utils/gather/vcenter";
import { cachedVcenterPerformance } from "utils/gather/vcenter-performance";
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
    const machines = await vcenterInventory(connections[name]);
    let hosts = [],
      hostError = "";
    try {
      hosts = await vcenterHosts(connections[name]);
    } catch {
      hostError = "Could not load ESXi hosts. Check host inventory read permissions.";
    }
    const running = machines.find((machine) => machine.powerState === "POWERED_ON");
    const samples = running ? await cachedVcenterPerformance(connections[name], [running.id]) : {};
    return res.json({
      machines,
      hosts,
      hostError,
      url: new URL(connections[name].url).origin + "/ui",
      performanceCheck: running
        ? { vmName: running.name, ...(samples[running.id] || { status: "no-samples" }) }
        : { status: "not-running" },
    });
  } catch {
    return res.status(502).json({
      error:
        "Could not read vCenter. Check the HTTPS certificate, server reachability, service account and read-only inventory permissions.",
    });
  }
}
