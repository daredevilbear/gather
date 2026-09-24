import { createHash } from "node:crypto";

import { xml2js } from "xml-js";

import { vcenterOrigin } from "./vcenter";

const countersWanted = {
  "cpu.usage.average": { field: "cpuPercent", unit: "percent", divisor: 100 },
  "mem.active.average": { field: "activeMemoryMiB", unit: "kiloBytes", divisor: 1024 },
  "mem.consumed.average": { field: "consumedMemoryMiB", unit: "kiloBytes", divisor: 1024 },
};
const children = (node, name) =>
  (node?.elements || []).filter((item) => item.type === "element" && item.name.split(":").at(-1) === name);
const child = (node, name) => children(node, name)[0];
const text = (node) =>
  (node?.elements || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
const escape = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char],
  );
const ref = (type, value) => `<_this type="${type}">${escape(value)}</_this>`;
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
class PerformanceError extends Error {
  constructor(code) {
    super("vCenter performance data unavailable");
    this.code = code;
  }
}
function boundedSet(cache, key, value) {
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}
const metadataCache = new Map();
const resultsCache = new Map();

function parseEnvelope(xml) {
  if (xml.length > 8 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new PerformanceError("invalid-response");
  let root;
  try {
    root = xml2js(xml, { compact: false, ignoreComment: true, ignoreDeclaration: true });
  } catch {
    throw new PerformanceError("invalid-response");
  }
  const body = child(child(root, "Envelope"), "Body");
  if (!body) throw new PerformanceError("invalid-response");
  const fault = child(body, "Fault");
  if (fault) {
    const detail = child(fault, "detail");
    const denied = (detail?.elements || []).some((item) =>
      /NoPermission|InvalidLogin|NotAuthenticated/.test(item.name || ""),
    );
    throw new PerformanceError(denied ? "permission-denied" : "unavailable");
  }
  return body;
}
function metricCounters(properties) {
  const object = child(child(properties, "returnval"), "objects");
  const property = children(object, "propSet").find((item) => text(child(item, "name")) === "perfCounter");
  return children(child(property, "val"), "PerfCounterInfo").flatMap((counter) => {
    const name = `${text(child(child(counter, "groupInfo"), "key"))}.${text(child(child(counter, "nameInfo"), "key"))}.${text(child(counter, "rollupType"))}`;
    const spec = countersWanted[name];
    const id = Number(text(child(counter, "key")));
    return spec && text(child(child(counter, "unitInfo"), "key")) === spec.unit && Number.isInteger(id) && id > 0
      ? [{ id, ...spec }]
      : [];
  });
}
function sampleMetrics(entity, counters, now) {
  const samples = children(entity, "sampleInfo");
  const sample = samples.at(-1);
  const timestamp = Date.parse(text(child(sample, "timestamp")));
  const interval = Number(text(child(sample, "interval")));
  if (!Number.isFinite(timestamp) || !Number.isFinite(interval) || interval <= 0) return { status: "no-samples" };
  const result = {
    status: now - timestamp > Math.max(90000, interval * 3000) || timestamp > now + 60000 ? "stale" : "live",
    sampledAt: new Date(timestamp).toISOString(),
    intervalSeconds: interval,
    cpuPercent: null,
    activeMemoryMiB: null,
    consumedMemoryMiB: null,
  };
  for (const series of children(entity, "value")) {
    const id = child(series, "id");
    if (text(child(id, "instance")) !== "") continue; // Aggregate, not per-vCPU/device instances.
    const counter = counters.find((item) => item.id === Number(text(child(id, "counterId"))));
    const raw = text(children(series, "value")[samples.length - 1]);
    const value = raw.trim() ? Number(raw) : NaN;
    if (counter && Number.isFinite(value) && value >= 0) result[counter.field] = value / counter.divisor;
  }
  if (result.cpuPercent === null && result.activeMemoryMiB === null && result.consumedMemoryMiB === null)
    result.status = "no-samples";
  return result;
}

// SOAP uses the existing vCenter origin and credentials, never an arbitrary client URL.
// No VM write operations are issued. Sessions are always closed after each batch.
export async function withVcenterSoap(connection, operation, request = fetch) {
  const origin = vcenterOrigin(connection);
  let cookie = "";
  let sessionManager;
  let version = "6.5";
  const deadline = AbortSignal.timeout(45000);
  async function call(method, content, logout = false) {
    const response = await request(new URL("/sdk", origin), {
      method: "POST",
      redirect: "error",
      signal: logout ? AbortSignal.timeout(5000) : AbortSignal.any([deadline, AbortSignal.timeout(10000)]),
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"urn:vim25/${version}"`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soap:Body><${method} xmlns="urn:vim25">${content}</${method}></soap:Body></soap:Envelope>`,
    });
    // Only the session cookie is sent back to this same HTTPS origin.
    const cookies = response.headers?.getSetCookie?.() || [response.headers?.get?.("set-cookie") || ""];
    for (const value of cookies) {
      const match = value.match(/(?:^|,\s*)(vmware_soap_session=[^;\r\n]+)/);
      if (match) cookie = match[1];
    }
    if ([401, 403].includes(response.status)) throw new PerformanceError("permission-denied");
    if ([404, 405].includes(response.status)) throw new PerformanceError("unsupported");
    const body = parseEnvelope(await response.text());
    if (!response.ok) throw new PerformanceError("unavailable");
    const result = child(body, `${method}Response`);
    if (!result) throw new PerformanceError("invalid-response");
    return result;
  }
  try {
    const info = child(await call("RetrieveServiceContent", ref("ServiceInstance", "ServiceInstance")), "returnval");
    sessionManager = text(child(info, "sessionManager"));
    const manager = text(child(info, "perfManager"));
    const collector = text(child(info, "propertyCollector"));
    const apiVersion = text(child(child(info, "about"), "apiVersion"));
    if (!sessionManager || !manager || !collector || !/^\d+(\.\d+)+$/.test(apiVersion))
      throw new PerformanceError("unsupported");
    version = apiVersion;
    await call(
      "Login",
      `${ref("SessionManager", sessionManager)}<userName>${escape(connection.username)}</userName><password>${escape(connection.password)}</password>`,
    );
    if (!cookie) throw new PerformanceError("invalid-response");
    return await operation({ call, manager, collector });
  } finally {
    if (cookie && sessionManager) {
      try {
        await call("Logout", ref("SessionManager", sessionManager), true);
      } catch {
        /* Server also expires idle sessions. */
      }
    }
  }
}

export { child, children, escape, ref, text };
export async function vcenterPerformance(connection, vmIds, request = fetch) {
  const ids = [...new Set(vmIds)].filter((id) => typeof id === "string" && /^vm-\d+$/.test(id)).sort();
  if (!ids.length) return {};
  return withVcenterSoap(
    connection,
    async ({ call, manager, collector }) => {
      const key = fingerprint(connection);
      let metadata = metadataCache.get(key);
      if (!metadata || metadata.expires <= Date.now()) {
        const properties = await call(
          "RetrievePropertiesEx",
          `${ref("PropertyCollector", collector)}<specSet><propSet><type>PerformanceManager</type><all>false</all><pathSet>perfCounter</pathSet></propSet><objectSet><obj type="PerformanceManager">${escape(manager)}</obj></objectSet></specSet><options/>`,
        );
        metadata = { counters: metricCounters(properties), rates: new Map(), expires: Date.now() + 300000 };
        if (!metadata.counters.length) throw new PerformanceError("unsupported");
        boundedSet(metadataCache, key, metadata);
      }
      const results = {};
      for (let offset = 0; offset < ids.length; offset += 50) {
        const batch = ids.slice(offset, offset + 50);
        // Bound concurrency when discovering each VM's real-time sampling interval.
        for (let index = 0; index < batch.length; index += 4) {
          await Promise.all(
            batch.slice(index, index + 4).map(async (id) => {
              if (!metadata.rates.get(id)) {
                try {
                  const provider = child(
                    await call(
                      "QueryPerfProviderSummary",
                      `${ref("PerformanceManager", manager)}<entity type="VirtualMachine">${escape(id)}</entity>`,
                    ),
                    "returnval",
                  );
                  const rate = Number(text(child(provider, "refreshRate")));
                  metadata.rates.set(
                    id,
                    ["true", "1"].includes(text(child(provider, "currentSupported"))) &&
                      Number.isInteger(rate) &&
                      rate > 0
                      ? rate
                      : null,
                  );
                } catch (error) {
                  results[id] = { status: error.code || "unavailable" };
                }
              }
            }),
          );
        }
        const available = batch.filter((id) => !results[id] && metadata.rates.get(id));
        for (const id of batch) if (!results[id] && !metadata.rates.get(id)) results[id] = { status: "unsupported" };
        if (!available.length) continue;
        const specs = available
          .map(
            (id) =>
              `<querySpec><entity type="VirtualMachine">${escape(id)}</entity><maxSample>1</maxSample>${metadata.counters.map((counter) => `<metricId><counterId>${counter.id}</counterId><instance></instance></metricId>`).join("")}<intervalId>${metadata.rates.get(id)}</intervalId><format>normal</format></querySpec>`,
          )
          .join("");
        try {
          const metrics = await call("QueryPerf", ref("PerformanceManager", manager) + specs);
          for (const id of available) results[id] = { status: "no-samples" };
          for (const entity of children(metrics, "returnval")) {
            const id = text(child(entity, "entity"));
            if (available.includes(id)) results[id] = sampleMetrics(entity, metadata.counters, Date.now());
          }
        } catch (error) {
          for (const id of available) results[id] = { status: error.code || "unavailable" };
        }
      }
      return results;
    },
    request,
  );
}

export async function cachedVcenterPerformance(connection, vmIds) {
  const ids = [...new Set(vmIds)].sort();
  if (!ids.length) return {};
  const key = fingerprint([connection, ids]);
  const existing = resultsCache.get(key);
  if (existing && (existing.pending || existing.expires > Date.now())) return existing.promise;
  const entry = { pending: true, expires: 0 };
  entry.promise = vcenterPerformance(connection, ids)
    .catch((error) => Object.fromEntries(ids.map((id) => [id, { status: error.code || "unavailable" }])))
    .then((result) => {
      entry.pending = false;
      entry.expires = Date.now() + 20000;
      return result;
    });
  boundedSet(resultsCache, key, entry);
  return entry.promise;
}
