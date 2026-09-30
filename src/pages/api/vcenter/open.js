import { servicesFromConfig } from "utils/config/service-helpers";
import { vcenterConnections, vcenterOrigin } from "utils/gather/vcenter";
import { vcenterObjectUrl } from "utils/gather/vcenter-links";
import { withVcenterSoap } from "utils/gather/vcenter-performance";

function published(groups, instance, vm, host) {
  return groups.some(
    (group) =>
      (group.services || []).some(
        (service) =>
          service.vcenterServer === instance && (host ? service.vcenterHost === host : service.vcenterVM === vm),
      ) || published(group.groups || [], instance, vm, host),
  );
}
// Middleware enforces dashboard authentication; only published objects may be opened.
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
    (vm !== undefined && (typeof vm !== "string" || !/^vm-\d+$/.test(vm))) ||
    (host !== undefined && (typeof host !== "string" || !/^host-\d+$/.test(host))) ||
    !!vm === !!host
  )
    return res.status(400).json({ error: "Select a VM or ESXi host." });
  try {
    if (!published(await servicesFromConfig(), instance, vm, host))
      return res.status(404).json({ error: "This object is not on the shared dashboard." });
    const connections = await vcenterConnections();
    if (!Object.hasOwn(connections, instance)) return res.status(404).json({ error: "vCenter connection not found." });
    const connection = connections[instance];
    const url = await withVcenterSoap(connection, ({ instanceUuid }) =>
      vcenterObjectUrl(vcenterOrigin(connection), instanceUuid, vm, host),
    );
    return res.redirect(302, url);
  } catch {
    return res.status(502).json({ error: "Could not open this object. Check the vCenter connection and try again." });
  }
}
