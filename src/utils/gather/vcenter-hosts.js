import { createHash } from "node:crypto";

import { child, children, escape, ref, text, withVcenterSoap } from "./vcenter-performance";

const paths = [
  "name",
  "runtime.connectionState",
  "runtime.inMaintenanceMode",
  "overallStatus",
  "summary.hardware",
  "summary.quickStats",
  "vm",
];
const number = (node) => {
  const value = text(node).trim();
  return value && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
};
function properties(object) {
  return Object.fromEntries(
    children(object, "propSet").map((property) => [text(child(property, "name")), child(property, "val")]),
  );
}
async function retrieve(call, collector, type, ids, fields) {
  const objects = [];
  for (let i = 0; i < ids.length; i += 100) {
    let result = child(
      await call(
        "RetrievePropertiesEx",
        `${ref("PropertyCollector", collector)}<specSet><propSet><type>${type}</type><all>false</all>${fields.map((field) => `<pathSet>${field}</pathSet>`).join("")}</propSet>${ids
          .slice(i, i + 100)
          .map((id) => `<objectSet><obj type="${type}">${escape(id)}</obj></objectSet>`)
          .join("")}</specSet><options><maxObjects>100</maxObjects></options>`,
      ),
      "returnval",
    );
    objects.push(...children(result, "objects"));
    let token = text(child(result, "token"));
    const seen = new Set();
    while (token) {
      if (seen.has(token) || seen.size >= 100) throw Error("Invalid vCenter continuation");
      seen.add(token);
      result = child(
        await call(
          "ContinueRetrievePropertiesEx",
          `${ref("PropertyCollector", collector)}<token>${escape(token)}</token>`,
        ),
        "returnval",
      );
      objects.push(...children(result, "objects"));
      token = text(child(result, "token"));
    }
  }
  return objects;
}
export async function vcenterHostStats(connection, hostIds, request = fetch) {
  const ids = [...new Set(hostIds)].filter((id) => typeof id === "string" && /^host-\d+$/.test(id));
  if (!ids.length) return {};
  return withVcenterSoap(
    connection,
    async ({ call, collector }) => {
      const objects = await retrieve(call, collector, "HostSystem", ids, paths);
      const hosts = objects
        .filter((object) => ids.includes(text(child(object, "obj"))))
        .map((object) => ({ id: text(child(object, "obj")), props: properties(object) }));
      const vmIds = [...new Set(hosts.flatMap(({ props }) => children(props.vm, "ManagedObjectReference").map(text)))];
      let vmStates = new Map();
      try {
        vmStates = new Map(
          (await retrieve(call, collector, "VirtualMachine", vmIds, ["runtime.powerState"])).map((object) => [
            text(child(object, "obj")),
            text(properties(object)["runtime.powerState"]),
          ]),
        );
      } catch {
        /* Host metrics remain useful when VM visibility is restricted. */
      }
      const checkedAt = new Date().toISOString();
      return Object.fromEntries(
        hosts.map(({ id, props }) => {
          const hardware = props["summary.hardware"],
            quick = props["summary.quickStats"];
          const connected = text(props["runtime.connectionState"]) === "connected";
          const cpuMhz = number(child(hardware, "cpuMhz")),
            cores = number(child(hardware, "numCpuCores"));
          const usedCpu = number(child(quick, "overallCpuUsage"));
          const totalMemory = number(child(hardware, "memorySize"));
          const maintenance = text(props["runtime.inMaintenanceMode"]);
          const vms = children(props.vm, "ManagedObjectReference").map(text);
          const completeVMs =
            props.vm && vms.every((vm) => ["poweredOn", "poweredOff", "suspended"].includes(vmStates.get(vm)));
          return [
            id,
            {
              id,
              name: text(props.name) || id,
              connectionState: text(props["runtime.connectionState"]) || "unknown",
              maintenance: ["true", "1"].includes(maintenance)
                ? true
                : ["false", "0"].includes(maintenance)
                  ? false
                  : null,
              health: connected ? text(props.overallStatus) || "gray" : "gray",
              cpuPercent:
                connected && cpuMhz > 0 && cores > 0 && usedCpu !== null ? (usedCpu / (cpuMhz * cores)) * 100 : null,
              usedMemoryMiB: connected ? number(child(quick, "overallMemoryUsage")) : null,
              totalMemoryMiB: totalMemory === null ? null : totalMemory / 1048576,
              totalVMs: props.vm ? vms.length : null,
              runningVMs: connected && completeVMs ? vms.filter((vm) => vmStates.get(vm) === "poweredOn").length : null,
              checkedAt,
            },
          ];
        }),
      );
    },
    request,
  );
}
const cache = new Map();
export async function cachedVcenterHostStats(connection, hostIds) {
  const ids = [...new Set(hostIds)].sort();
  const key = createHash("sha256")
    .update(JSON.stringify([connection, ids]))
    .digest("hex");
  const previous = cache.get(key);
  if (previous && (previous.pending || previous.expires > Date.now())) return previous.promise;
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  const entry = { pending: true, expires: 0 };
  entry.promise = vcenterHostStats(connection, ids).then(
    (result) => {
      entry.pending = false;
      entry.expires = Date.now() + 20000;
      return result;
    },
    () => {
      entry.pending = false;
      entry.expires = Date.now() + 20000;
      throw Error("Could not read ESXi host metrics. Check vCenter read permissions and /sdk access.");
    },
  );
  cache.set(key, entry);
  return entry.promise;
}
