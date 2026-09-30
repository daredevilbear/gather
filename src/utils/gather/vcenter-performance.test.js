import { afterEach, expect, it, vi } from "vitest";

import { cachedVcenterPerformance, vcenterPerformance, withVcenterSoap } from "./vcenter-performance";

vi.mock("utils/config/config", () => ({ CONF_DIR: "/tmp", substituteEnvironmentVars: (s) => s }));
const connection = { url: "https://vcenter.test", username: "reader<&", password: 'secret"&' };
const envelope = (method, body) =>
  `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><${method}Response xmlns="urn:vim25">${body}</${method}Response></s:Body></s:Envelope>`;
const counter = (id, group, name, unit) =>
  `<PerfCounterInfo><key>${id}</key><nameInfo><key>${name}</key></nameInfo><groupInfo><key>${group}</key></groupInfo><unitInfo><key>${unit}</key></unitInfo><rollupType>average</rollupType></PerfCounterInfo>`;
const metric = (id, values, instance = "") =>
  `<value xsi:type="PerfMetricIntSeries" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><id><counterId>${id}</counterId><instance>${instance}</instance></id>${values.map((v) => `<value>${v}</value>`).join("")}</value>`;
function entity(id, timestamp, values = [1234, 2097152, 3145728], interval = 20) {
  return `<returnval xsi:type="PerfEntityMetric" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><entity type="VirtualMachine">${id}</entity><sampleInfo><timestamp>${timestamp}</timestamp><interval>${interval}</interval></sampleInfo>${metric(91, [values[0]])}${metric(105, [values[1]])}${metric(118, [values[2]])}</returnval>`;
}
function fixture(overrides = {}) {
  return vi.fn(async (url, options) => {
    expect(url.origin).toBe("https://vcenter.test");
    expect(url.pathname).toBe("/sdk");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const method = options.body.match(/<soap:Body><(\w+)/)[1];
    const defaults = {
      RetrieveServiceContent:
        '<returnval><sessionManager type="SessionManager">SessionManager</sessionManager><perfManager type="PerformanceManager">perf-manager</perfManager><propertyCollector type="PropertyCollector">collector</propertyCollector><about><apiVersion>8.0.3.0</apiVersion></about></returnval>',
      Login: "<returnval><key>session-secret</key></returnval>",
      RetrievePropertiesEx: `<returnval><objects><obj type="PerformanceManager">perf-manager</obj><propSet><name>perfCounter</name><val xsi:type="ArrayOfPerfCounterInfo" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${counter(91, "cpu", "usage", "percent")}${counter(105, "mem", "active", "kiloBytes")}${counter(118, "mem", "consumed", "kiloBytes")}</val></propSet></objects></returnval>`,
      QueryPerfProviderSummary:
        "<returnval><currentSupported>true</currentSupported><refreshRate>20</refreshRate></returnval>",
      QueryPerf: entity("vm-1", new Date().toISOString()) + entity("vm-2", new Date().toISOString()),
      Logout: "",
    };
    const replacement = overrides[method];
    if (replacement instanceof Error) throw replacement;
    if (typeof replacement === "function") return replacement(options);
    return {
      ok: true,
      status: 200,
      headers: new Headers(
        method === "Login" ? { "set-cookie": 'vmware_soap_session="session-secret"; Path=/sdk; Secure; HttpOnly' } : {},
      ),
      text: async () => envelope(method, replacement ?? defaults[method]),
    };
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("discovers counter IDs and intervals, batches VMs and converts CPU percent and memory units", async () => {
  const request = fixture();
  const result = await vcenterPerformance(connection, ["vm-1", "vm-2"], request);
  expect(result["vm-1"]).toMatchObject({
    status: "live",
    cpuPercent: 12.34,
    activeMemoryMiB: 2048,
    consumedMemoryMiB: 3072,
    intervalSeconds: 20,
  });
  const queries = request.mock.calls.filter(([, args]) => args.body.includes("<QueryPerf xmlns="));
  expect(queries).toHaveLength(1);
  expect(queries[0][1].body).toContain('<entity type="VirtualMachine">vm-2</entity>');
  expect(queries[0][1].body).toContain("<maxSample>1</maxSample><metricId><counterId>91</counterId>");
  expect(queries[0][1].body).toContain("<intervalId>20</intervalId>");
  expect(queries[0][1].headers.Cookie).toBe('vmware_soap_session="session-secret"');
  expect(queries[0][1].headers.SOAPAction).toBe('"urn:vim25/8.0.3.0"');
  expect(request.mock.calls[1][1].body).toContain("<userName>reader&lt;&amp;</userName>");
  expect(request.mock.calls.at(-1)[1].body).toContain("<Logout");
  expect(JSON.stringify(result)).not.toContain("secret");
});
it("does not turn missing counters or sentinel -1 into zero and marks old samples stale", async () => {
  const request = fixture({ QueryPerf: entity("vm-1", new Date(Date.now() - 300000).toISOString(), [0, -1, 1024]) });
  const result = await vcenterPerformance({ ...connection, username: "old" }, ["vm-1", "vm-2"], request);
  expect(result["vm-1"]).toMatchObject({ status: "stale", cpuPercent: 0, activeMemoryMiB: null, consumedMemoryMiB: 1 });
  expect(result["vm-2"]).toEqual({ status: "no-samples" });
});
it("honors the provider interval and ignores per-device values", async () => {
  const request = fixture({
    QueryPerfProviderSummary:
      "<returnval><currentSupported>true</currentSupported><refreshRate>60</refreshRate></returnval>",
    QueryPerf: entity("vm-1", new Date().toISOString()).replace(metric(91, [1234]), metric(91, [1234], "0")),
  });
  const result = await vcenterPerformance({ ...connection, username: "interval" }, ["vm-1"], request);
  expect(result["vm-1"].cpuPercent).toBeNull();
  expect(request.mock.calls.find(([, args]) => args.body.includes("<QueryPerf xmlns="))[1].body).toContain(
    "<intervalId>60</intervalId>",
  );
});
it("redacts SOAP permission faults and logs out on errors", async () => {
  const request = fixture({
    QueryPerf: async () => ({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () =>
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultstring>secret detail</faultstring><detail><NoPermissionFault xmlns="urn:vim25"/></detail></s:Fault></s:Body></s:Envelope>',
    }),
  });
  const result = await vcenterPerformance({ ...connection, username: "denied" }, ["vm-1"], request);
  expect(result["vm-1"]).toEqual({ status: "permission-denied" });
  expect(request.mock.calls.at(-1)[1].body).toContain("<Logout");
  expect(JSON.stringify(result)).not.toContain("secret");
});
it("rejects DTD/entity payloads and still logs out", async () => {
  const request = fixture({
    RetrievePropertiesEx: async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><foo>&x;</foo>',
    }),
  });
  await expect(vcenterPerformance({ ...connection, username: "xml" }, ["vm-1"], request)).rejects.toMatchObject({
    code: "invalid-response",
  });
  expect(request.mock.calls.at(-1)[1].body).toContain("<Logout");
});
it("skips unsupported providers and validates the configured origin before authentication", async () => {
  const request = fixture({
    QueryPerfProviderSummary:
      "<returnval><currentSupported>false</currentSupported><refreshRate>-1</refreshRate></returnval>",
  });
  expect(await vcenterPerformance({ ...connection, username: "no-provider" }, ["vm-1"], request)).toEqual({
    "vm-1": { status: "unsupported" },
  });
  expect(request.mock.calls.some(([, args]) => args.body.includes("<QueryPerf xmlns="))).toBe(false);
  const untouched = vi.fn();
  await expect(vcenterPerformance({ ...connection, url: "http://vcenter.test" }, ["vm-1"], untouched)).rejects.toThrow(
    "HTTPS",
  );
  expect(untouched).not.toHaveBeenCalled();
});
it("coalesces concurrent polls, isolates credentials and expires results", async () => {
  const request = fixture();
  vi.stubGlobal("fetch", request);
  const conn = { ...connection, username: "cached" };
  await Promise.all([
    cachedVcenterPerformance(conn, ["vm-2", "vm-1"]),
    cachedVcenterPerformance(conn, ["vm-1", "vm-2"]),
  ]);
  const count = request.mock.calls.length;
  await cachedVcenterPerformance(conn, ["vm-1", "vm-2"]);
  expect(request).toHaveBeenCalledTimes(count);
  await cachedVcenterPerformance({ ...conn, password: "rotated" }, ["vm-1", "vm-2"]);
  expect(request.mock.calls.length).toBeGreaterThan(count);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 21000);
  const before = request.mock.calls.length;
  await cachedVcenterPerformance(conn, ["vm-1", "vm-2"]);
  expect(request.mock.calls.length).toBeGreaterThan(before);
});
it("bounds failed SDK retries and returns a safe compatibility status", async () => {
  const request = vi.fn(async () => ({ ok: false, status: 404, headers: new Headers() }));
  vi.stubGlobal("fetch", request);
  const conn = { ...connection, username: "no-sdk" };
  expect(await cachedVcenterPerformance(conn, ["vm-1"])).toEqual({ "vm-1": { status: "unsupported" } });
  await cachedVcenterPerformance(conn, ["vm-1"]);
  expect(request).toHaveBeenCalledTimes(1);
});

it("reads the server instance identity for object links and closes the session", async () => {
  const request = fixture({
    RetrieveServiceContent:
      "<returnval><sessionManager>SessionManager</sessionManager><perfManager>perf-manager</perfManager><propertyCollector>collector</propertyCollector><about><apiVersion>8.0.3.0</apiVersion><instanceUuid>12345678-1234-1234-1234-123456789abc</instanceUuid></about></returnval>",
  });
  expect(await withVcenterSoap(connection, ({ instanceUuid }) => instanceUuid, request)).toBe(
    "12345678-1234-1234-1234-123456789abc",
  );
  expect(request.mock.calls.at(-1)[1].body).toContain("<Logout");
});
