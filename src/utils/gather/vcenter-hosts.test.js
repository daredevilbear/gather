import { afterEach, expect, it, vi } from "vitest";

import { cachedVcenterHostStats, vcenterHostStats } from "./vcenter-hosts";

vi.mock("utils/config/config", () => ({ CONF_DIR: "/tmp", substituteEnvironmentVars: (s) => s }));
const connection = { url: "https://vc.test", username: "reader", password: "secret" };
const prop = (name, val) => `<propSet><name>${name}</name><val>${val}</val></propSet>`;
function host(connectionState = "connected", missing = false) {
  return `<objects><obj type="HostSystem">host-1</obj>${prop("name", "esxi.example.test")}${prop("runtime.connectionState", connectionState)}${prop("runtime.inMaintenanceMode", "true")}${prop("overallStatus", "yellow")}${prop("summary.hardware", "<cpuMhz>2000</cpuMhz><numCpuCores>8</numCpuCores><memorySize>68719476736</memorySize>")}${prop("summary.quickStats", missing ? "" : "<overallCpuUsage>4000</overallCpuUsage><overallMemoryUsage>16384</overallMemoryUsage>")}${prop("vm", '<ManagedObjectReference type="VirtualMachine">vm-1</ManagedObjectReference><ManagedObjectReference type="VirtualMachine">vm-2</ManagedObjectReference>')}</objects>`;
}
function requestFixture({ state = "connected", missing = false, denyVM = false, paged = false } = {}) {
  return vi.fn(async (url, options) => {
    expect(url.href).toBe("https://vc.test/sdk");
    const method = options.body.match(/<soap:Body><(\w+)/)[1];
    let body = "";
    if (method === "RetrieveServiceContent")
      body =
        "<returnval><sessionManager>session</sessionManager><perfManager>perf</perfManager><propertyCollector>collector</propertyCollector><about><apiVersion>8.0.3.0</apiVersion></about></returnval>";
    if (method === "RetrievePropertiesEx") {
      if (options.body.includes("<type>HostSystem</type>"))
        body = `<returnval>${paged ? "<token>page2</token>" : host(state, missing)}</returnval>`;
      else {
        if (denyVM) throw Error("private permission failure");
        body = `<returnval><objects><obj type="VirtualMachine">vm-1</obj>${prop("runtime.powerState", "poweredOn")}</objects><objects><obj type="VirtualMachine">vm-2</obj>${prop("runtime.powerState", "poweredOff")}</objects></returnval>`;
      }
    }
    if (method === "ContinueRetrievePropertiesEx") body = `<returnval>${host(state, missing)}</returnval>`;
    return {
      ok: true,
      status: 200,
      headers: new Headers(method === "Login" ? { "set-cookie": 'vmware_soap_session="secret-token"; Path=/sdk' } : {}),
      text: async () =>
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><${method}Response xmlns="urn:vim25">${body}</${method}Response></s:Body></s:Envelope>`,
    };
  });
}
afterEach(() => vi.unstubAllGlobals());
it("reads host health, maintenance, utilization and VM counts including paginated properties", async () => {
  const request = requestFixture({ paged: true });
  const result = await vcenterHostStats(connection, ["host-1"], request);
  expect(result["host-1"]).toMatchObject({
    connectionState: "connected",
    health: "yellow",
    maintenance: true,
    cpuPercent: 25,
    usedMemoryMiB: 16384,
    totalMemoryMiB: 65536,
    runningVMs: 1,
    totalVMs: 2,
  });
  expect(result["host-1"].checkedAt).toMatch(/^\d{4}-/);
  expect(request.mock.calls.at(-1)[1].body).toContain("<Logout");
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(JSON.stringify(result)).not.toContain("vm-1");
});
it("never reports cached utilization or healthy status for disconnected hosts", async () => {
  const result = await vcenterHostStats(connection, ["host-1"], requestFixture({ state: "disconnected" }));
  expect(result["host-1"]).toMatchObject({ health: "gray", cpuPercent: null, usedMemoryMiB: null, runningVMs: null });
});
it("preserves missing utilization and restricted VM counts as unknown, not zero", async () => {
  const result = await vcenterHostStats(connection, ["host-1"], requestFixture({ missing: true, denyVM: true }));
  expect(result["host-1"]).toMatchObject({ cpuPercent: null, usedMemoryMiB: null, runningVMs: null, totalVMs: 2 });
});
it("coalesces dashboard polls per connection and host set", async () => {
  const request = requestFixture();
  vi.stubGlobal("fetch", request);
  await Promise.all([cachedVcenterHostStats(connection, ["host-1"]), cachedVcenterHostStats(connection, ["host-1"])]);
  const calls = request.mock.calls.length;
  await cachedVcenterHostStats(connection, ["host-1"]);
  expect(request).toHaveBeenCalledTimes(calls);
});
