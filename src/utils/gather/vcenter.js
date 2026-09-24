import { readFile } from "node:fs/promises";
import path from "node:path";

import { CONF_DIR, substituteEnvironmentVars } from "utils/config/config";
import { loadYaml } from "utils/config/yaml";

export async function vcenterConnections() {
  try {
    return loadYaml(substituteEnvironmentVars(await readFile(path.join(CONF_DIR, "vcenter.yaml"), "utf8"))) || {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
export async function vcenterInventory(connection, request = fetch) {
  const url = new URL(connection?.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname) ||
    typeof connection.username !== "string" ||
    !connection.username ||
    typeof connection.password !== "string" ||
    !connection.password
  )
    throw Error("Configure an HTTPS vCenter origin, username and password.");
  const call = (route, method, headers) =>
    request(new URL(route, url.origin), { method, headers, redirect: "error", signal: AbortSignal.timeout(10000) });
  const login = await call("/api/session", "POST", {
    Authorization: `Basic ${Buffer.from(`${connection.username}:${connection.password}`).toString("base64")}`,
  });
  if (!login.ok) throw Error("vCenter sign-in failed. Check the service account and permissions.");
  const session = await login.json();
  if (typeof session !== "string" || !session) throw Error("Unexpected vCenter session response.");
  const headers = { "vmware-api-session-id": session };
  try {
    const response = await call("/api/vcenter/vm", "GET", headers);
    if (!response.ok) throw Error("Could not read vCenter inventory. Check account permissions and API availability.");
    const list = await response.json();
    if (!Array.isArray(list)) throw Error("Unexpected vCenter inventory response.");
    return list.map((vm) => ({
      name: String(vm.name || vm.vm),
      powerState: String(vm.power_state || "UNKNOWN"),
      cpus: Number(vm.cpu_count) || 0,
      memoryMiB: Number(vm.memory_size_MiB) || 0,
    }));
  } finally {
    try {
      await call("/api/session", "DELETE", headers);
    } catch {
      /* Session also expires at vCenter. */
    }
  }
}
