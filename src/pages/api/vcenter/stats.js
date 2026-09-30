import { servicesFromConfig } from "utils/config/service-helpers";
import { cachedVcenterInventory, vcenterConnections } from "utils/gather/vcenter";
import { cachedVcenterHostStats } from "utils/gather/vcenter-hosts";
import { cachedVcenterPerformance } from "utils/gather/vcenter-performance";

function published(groups, instance, vm, host) {
  return groups.some(
    (group) =>
      (group.services || []).some(
        (service) =>
          service.vcenterServer === instance &&
          (host ? service.vcenterHost === host : vm ? service.vcenterVM === vm : service.vcenterSummary === true),
      ) || published(group.groups || [], instance, vm, host),
  );
}
function publishedVMs(groups, instance, field = "vcenterVM") {
  return groups.flatMap((group) => [
    ...(group.services || [])
      .filter((service) => service.vcenterServer === instance && service[field])
      .map((service) => service[field]),
    ...publishedVMs(group.groups || [], instance, field),
  ]);
}
// Dashboard authentication and disabled-account checks are enforced by middleware.
// Only explicitly published VM/host references (or aggregate summaries) are exposed.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  const { instance, vm, host } = req.query;
  if (
    typeof instance !== "string" ||
    !instance ||
    (vm !== undefined && (typeof vm !== "string" || !vm)) ||
    (host !== undefined && (typeof host !== "string" || !/^host-\d+$/.test(host))) ||
    (vm && host)
  )
    return res.status(400).json({ error: "Select a configured vCenter service." });
  try {
    const groups = await servicesFromConfig();
    if (!published(groups, instance, vm, host))
      return res.status(404).json({ error: "This vCenter service is not on the shared dashboard." });
    const connections = await vcenterConnections();
    if (!Object.hasOwn(connections, instance)) return res.status(404).json({ error: "vCenter connection not found." });
    if (host) {
      const result = await cachedVcenterHostStats(connections[instance], publishedVMs(groups, instance, "vcenterHost"));
      if (!result[host])
        return res.status(404).json({ error: "Host no longer exists or is not visible to the service account." });
      return res.json(result[host]);
    }
    const machines = await cachedVcenterInventory(connections[instance]);
    if (vm) {
      const machine = machines.find((item) => item.id === vm);
      if (!machine)
        return res.status(404).json({ error: "VM no longer exists or is not visible to the service account." });
      if (machine.powerState !== "POWERED_ON") return res.json({ ...machine, performance: { status: "not-running" } });
      const allowed = new Set(publishedVMs(groups, instance));
      const ids = machines
        .filter((item) => item.powerState === "POWERED_ON" && allowed.has(item.id))
        .map((item) => item.id);
      const performance = await cachedVcenterPerformance(connections[instance], ids);
      return res.json({ ...machine, performance: performance[vm] || { status: "no-samples" } });
    }
    return res.json({
      total: machines.length,
      running: machines.filter((item) => item.powerState === "POWERED_ON").length,
      stopped: machines.filter((item) => item.powerState === "POWERED_OFF").length,
      suspended: machines.filter((item) => item.powerState === "SUSPENDED").length,
      unknown: machines.filter((item) => !["POWERED_ON", "POWERED_OFF", "SUSPENDED"].includes(item.powerState)).length,
    });
  } catch {
    return res.status(502).json({ error: "vCenter is unavailable. Check the connection in Settings." });
  }
}
