import handler from "pages/api/vcenter/stats";
import { servicesFromConfig } from "utils/config/service-helpers";
import { cachedVcenterInventory, vcenterConnections } from "utils/gather/vcenter";
import { cachedVcenterHostStats } from "utils/gather/vcenter-hosts";
import { cachedVcenterPerformance } from "utils/gather/vcenter-performance";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("utils/gather/vcenter-performance", () => ({ cachedVcenterPerformance: vi.fn() }));
vi.mock("utils/gather/vcenter-hosts", () => ({ cachedVcenterHostStats: vi.fn() }));
vi.mock("utils/config/service-helpers", () => ({ servicesFromConfig: vi.fn() }));
vi.mock("utils/gather/vcenter", () => ({ cachedVcenterInventory: vi.fn(), vcenterConnections: vi.fn() }));
const response = () => {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
beforeEach(() => {
  vi.clearAllMocks();
  cachedVcenterPerformance.mockResolvedValue({ "vm-1": { status: "live", cpuPercent: 12.5 } });
  servicesFromConfig.mockResolvedValue([
    {
      services: [{ vcenterServer: "lab", vcenterVM: "vm-1" }],
      groups: [{ services: [{ vcenterServer: "lab", vcenterSummary: true }] }],
    },
  ]);
  vcenterConnections.mockResolvedValue({ lab: { url: "https://vc.test", password: "secret" } });
  cachedVcenterInventory.mockResolvedValue([
    { id: "vm-1", name: "App", powerState: "POWERED_ON", cpus: 2, memoryMiB: 4096 },
    { id: "vm-private", name: "Private", powerState: "SUSPENDED" },
  ]);
});
it("returns only the published VM or aggregate counts, without the other inventory or credentials", async () => {
  const vm = response();
  await handler({ method: "GET", query: { instance: "lab", vm: "vm-1" } }, vm);
  expect(vm.json).toHaveBeenCalledWith({
    id: "vm-1",
    name: "App",
    powerState: "POWERED_ON",
    cpus: 2,
    memoryMiB: 4096,
    performance: { status: "live", cpuPercent: 12.5 },
  });
  const summary = response();
  await handler({ method: "GET", query: { instance: "lab" } }, summary);
  expect(summary.json).toHaveBeenCalledWith({ total: 2, running: 1, stopped: 0, suspended: 1, unknown: 0 });
});
it("rejects unpublished VM IDs, arbitrary connections, methods and malformed parameters before fetching", async () => {
  for (const query of [
    { instance: "lab", vm: "vm-private" },
    { instance: "constructor" },
    { instance: "https://evil.test" },
    { instance: ["lab"] },
  ]) {
    const res = response();
    await handler({ method: "GET", query }, res);
    expect(res.status.mock.calls[0][0]).toBeGreaterThanOrEqual(400);
  }
  const res = response();
  await handler({ method: "POST", query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
  expect(cachedVcenterInventory).not.toHaveBeenCalled();
});
it("reports a deleted VM and upstream failure without exposing connection details", async () => {
  cachedVcenterInventory.mockResolvedValueOnce([]);
  const missing = response();
  await handler({ method: "GET", query: { instance: "lab", vm: "vm-1" } }, missing);
  expect(missing.status).toHaveBeenCalledWith(404);
  cachedVcenterInventory.mockRejectedValueOnce(Error("secret"));
  const failed = response();
  await handler({ method: "GET", query: { instance: "lab" } }, failed);
  expect(failed.status).toHaveBeenCalledWith(502);
  expect(JSON.stringify(failed.json.mock.calls)).not.toContain("secret");
});

it("requests metrics only for published running VMs and skips performance for stopped VMs", async () => {
  cachedVcenterInventory.mockResolvedValueOnce([
    { id: "vm-1", powerState: "POWERED_ON" },
    { id: "vm-private", powerState: "POWERED_ON" },
  ]);
  await handler({ method: "GET", query: { instance: "lab", vm: "vm-1" } }, response());
  expect(cachedVcenterPerformance).toHaveBeenCalledWith(expect.anything(), ["vm-1"]);
  cachedVcenterPerformance.mockClear();
  cachedVcenterInventory.mockResolvedValueOnce([{ id: "vm-1", powerState: "POWERED_OFF" }]);
  const stopped = response();
  await handler({ method: "GET", query: { instance: "lab", vm: "vm-1" } }, stopped);
  expect(cachedVcenterPerformance).not.toHaveBeenCalled();
  expect(stopped.json).toHaveBeenCalledWith({
    id: "vm-1",
    powerState: "POWERED_OFF",
    performance: { status: "not-running" },
  });
});

it("returns only published hosts and rejects mixed selectors before reading host data", async () => {
  servicesFromConfig.mockResolvedValue([{ services: [{ vcenterServer: "lab", vcenterHost: "host-1" }] }]);
  cachedVcenterHostStats.mockResolvedValue({ "host-1": { id: "host-1", health: "green" } });
  const res = response();
  await handler({ method: "GET", query: { instance: "lab", host: "host-1" } }, res);
  expect(res.json).toHaveBeenCalledWith({ id: "host-1", health: "green" });
  expect(cachedVcenterHostStats).toHaveBeenCalledWith(expect.anything(), ["host-1"]);
  cachedVcenterHostStats.mockClear();
  for (const query of [
    { instance: "lab", host: "host-2" },
    { instance: "lab", host: "host-1", vm: "vm-1" },
    { instance: "lab", host: ["host-1"] },
  ]) {
    await handler({ method: "GET", query }, response());
  }
  expect(cachedVcenterHostStats).not.toHaveBeenCalled();
});
