// Merge selected inventory into an existing group without replacing user content.
export function listVcenterServices(services, instance, path = [], group = "") {
  if (!Array.isArray(services)) return [];
  return services.flatMap((entry, index) =>
    Object.entries(entry).flatMap(([name, value]) => {
      const location = [...path, index, name];
      if (Array.isArray(value))
        return listVcenterServices(value, instance, location, group ? `${group} / ${name}` : name);
      return value?.vcenterServer === instance && (value.vcenterVM || value.vcenterHost || value.vcenterSummary)
        ? [{ name, group, path: location, value }]
        : [];
    }),
  );
}
export function removeVcenterService(services, card) {
  const copy = structuredClone(services);
  const parent = card.path.slice(0, -2).reduce((value, key) => value?.[key], copy);
  const index = card.path.at(-2),
    name = card.path.at(-1);
  if (!Array.isArray(parent) || JSON.stringify(parent[index]?.[name]) !== JSON.stringify(card.value))
    throw Error("This card changed. Reload dashboard cards and try again.");
  // A YAML entry normally contains one service; preserve any sibling keys.
  delete parent[index][name];
  if (!Object.keys(parent[index]).length) parent.splice(index, 1);
  return copy;
}

export function addVcenterServices(services, group, instance, machines, summary, url, hosts = []) {
  if (!Array.isArray(services)) throw Error("Services must be a list of groups.");
  const target = services.findIndex((entry) => Object.hasOwn(entry, group) && Array.isArray(entry[group]));
  if (target < 0) throw Error("Choose an existing service group. Create groups in Services first.");
  const existing = new Set();
  function scan(entries) {
    for (const entry of entries)
      for (const value of Object.values(entry)) {
        if (Array.isArray(value)) scan(value);
        else if (value?.vcenterServer === instance)
          existing.add(value.vcenterHost || value.vcenterVM || (value.vcenterSummary ? "summary" : ""));
      }
  }
  scan(services);
  const entries = [...services[target][group]];
  const names = new Set(entries.flatMap((entry) => Object.keys(entry)));
  let added = 0;
  function append(name, ref) {
    let unique = name;
    for (let i = 2; names.has(unique); i++) unique = `${name} (${i})`;
    names.add(unique);
    entries.push({ [unique]: { href: url, icon: "vmware.png", vcenterServer: instance, ...ref } });
    added++;
  }
  for (const vm of machines) {
    if (!vm.id || existing.has(vm.id)) continue;
    append(vm.name, { vcenterVM: vm.id, description: "vCenter virtual machine" });
    existing.add(vm.id);
  }
  for (const host of hosts) {
    if (!host.id || existing.has(host.id)) continue;
    append(host.name, { vcenterHost: host.id, description: "ESXi host" });
    existing.add(host.id);
  }
  if (summary && !existing.has("summary"))
    append(`${instance} overview`, { vcenterSummary: true, description: "vCenter inventory" });
  return { services: services.map((entry, i) => (i === target ? { ...entry, [group]: entries } : entry)), added };
}
