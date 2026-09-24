// Resolve legacy generic links at read time, preserving custom application URLs.
export function resolveVcenterLinks(groups, connections) {
  for (const group of groups) {
    for (const service of group.services || []) {
      const connection = Object.hasOwn(connections, service.vcenterServer) && connections[service.vcenterServer];
      if (!connection || (!service.vcenterVM && !service.vcenterHost)) continue;
      try {
        const url = new URL(service.href);
        if (url.origin !== new URL(connection.url).origin || !/^\/ui\/?$/.test(url.pathname) || url.search || url.hash)
          continue;
        const query = new URLSearchParams({ instance: service.vcenterServer });
        query.set(service.vcenterHost ? "host" : "vm", service.vcenterHost || service.vcenterVM);
        service.href = `/api/vcenter/open?${query}`;
      } catch {
        /* Leave non-URL and custom links unchanged. */
      }
    }
    resolveVcenterLinks(group.groups || [], connections);
  }
  return groups;
}

export function vcenterObjectUrl(origin, instanceUuid, vm, host) {
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(instanceUuid || ""))
    throw Error("vCenter instance identity unavailable");
  const id = host || vm;
  if (host ? !/^host-\d+$/.test(id) : !/^vm-\d+$/.test(id)) throw Error("Invalid object reference");
  return `${origin}/ui/app/${host ? "host" : "vm"};nav=h/urn:vmomi:${host ? "HostSystem" : "VirtualMachine"}:${id}:${instanceUuid}/summary`;
}
