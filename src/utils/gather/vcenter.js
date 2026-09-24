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
export function vcenterOrigin(connection) {
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
  return url.origin;
}
async function inventory(connection, request, kind) {
  const origin = vcenterOrigin(connection);
  const call = (route, method, headers) =>
    request(new URL(route, origin), { method, headers, redirect: "error", signal: AbortSignal.timeout(10000) });
  const login = await call("/api/session", "POST", {
    Authorization: `Basic ${Buffer.from(`${connection.username}:${connection.password}`).toString("base64")}`,
  });
  if (!login.ok) throw Error("vCenter sign-in failed. Check the service account and permissions.");
  const session = await login.json();
  if (typeof session !== "string" || !session) throw Error("Unexpected vCenter session response.");
  const headers = { "vmware-api-session-id": session };
  try {
    const response = await call(`/api/vcenter/${kind}`, "GET", headers);
    if (!response.ok) throw Error("Could not read vCenter inventory. Check account permissions and API availability.");
    const list = await response.json();
    if (!Array.isArray(list)) throw Error("Unexpected vCenter inventory response.");
    if (kind === "host")
      return list.map((host) => ({
        id: String(host.host || ""),
        name: String(host.name || host.host),
        connectionState: String(host.connection_state || "UNKNOWN"),
      }));
    return list.map((vm) => ({
      id: String(vm.vm || ""),
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

// A short server-only cache coalesces polls from cards sharing a connection.
const inventories = new Map();
export async function cachedVcenterInventory(connection) {
  const { createHash } = await import("node:crypto");
  const key = createHash("sha256").update(JSON.stringify(connection)).digest("hex");
  const now = Date.now();
  const existing = inventories.get(key);
  if (existing && existing.expires > now) return existing.promise;
  for (const [id, value] of inventories) if (value.expires <= now) inventories.delete(id);
  if (inventories.size >= 100) inventories.delete(inventories.keys().next().value);
  const promise = vcenterInventory(connection).catch((error) => {
    if (inventories.get(key)?.promise === promise) inventories.delete(key);
    throw error;
  });
  inventories.set(key, { promise, expires: now + 15000 });
  return promise;
}

export function vcenterInventory(connection, request = fetch) {
  return inventory(connection, request, "vm");
}
export function vcenterHosts(connection, request = fetch) {
  return inventory(connection, request, "host");
}
