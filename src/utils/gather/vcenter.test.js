import { expect, it, vi } from "vitest";
import { vcenterHosts, vcenterInventory } from "./vcenter";
vi.mock("utils/config/config", () => ({ CONF_DIR: "/tmp", substituteEnvironmentVars: (s) => s }));
const connection = { url: "https://vcenter.test", username: "reader", password: "secret" };
it("authenticates on the server, reads sanitized inventory and closes its session", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => "session-token" })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          vm: "vm-1",
          name: "Example",
          power_state: "POWERED_ON",
          cpu_count: 2,
          memory_size_MiB: 2048,
          secret: "not exposed",
        },
      ],
    })
    .mockResolvedValueOnce({ ok: true });
  expect(await vcenterInventory(connection, request)).toEqual([
    { id: "vm-1", name: "Example", powerState: "POWERED_ON", cpus: 2, memoryMiB: 2048 },
  ]);
  expect(request.mock.calls.map(([url, options]) => [url.pathname, options.method])).toEqual([
    ["/api/session", "POST"],
    ["/api/vcenter/vm", "GET"],
    ["/api/session", "DELETE"],
  ]);
  expect(request.mock.calls[1][1].headers).toEqual({ "vmware-api-session-id": "session-token" });
  expect(request.mock.calls[0][1].redirect).toBe("error");
});
it("rejects insecure origins and closes a session after inventory fails", async () => {
  await expect(vcenterInventory({ ...connection, url: "http://vcenter.test" }, vi.fn())).rejects.toThrow("HTTPS");
  const request = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => "session" })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true });
  await expect(vcenterInventory(connection, request)).rejects.toThrow("inventory");
  expect(request.mock.calls[2][1].method).toBe("DELETE");
});
it("coalesces concurrent card polls without retaining a failed inventory", async () => {
  const { cachedVcenterInventory } = await import("./vcenter");
  const request = vi.fn().mockImplementation(async (url) => {
    if (url.pathname === "/api/session") return { ok: true, json: async () => "token" };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal("fetch", request);
  try {
    await Promise.all([
      cachedVcenterInventory({ ...connection, username: "cache-test" }),
      cachedVcenterInventory({ ...connection, username: "cache-test" }),
    ]);
    expect(request).toHaveBeenCalledTimes(3);
    request.mockRejectedValueOnce(Error("offline"));
    await expect(cachedVcenterInventory({ ...connection, username: "failed-test" })).rejects.toThrow("offline");
    await expect(cachedVcenterInventory({ ...connection, username: "failed-test" })).resolves.toEqual([]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("loads sanitized ESXi host inventory through the same read-only connection", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => "session" })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [{ host: "host-1", name: "ESXi", connection_state: "CONNECTED", secret: "hidden" }],
    })
    .mockResolvedValueOnce({ ok: true });
  expect(await vcenterHosts(connection, request)).toEqual([
    { id: "host-1", name: "ESXi", connectionState: "CONNECTED" },
  ]);
  expect(request.mock.calls[1][0].pathname).toBe("/api/vcenter/host");
  expect(request.mock.calls.at(-1)[1].method).toBe("DELETE");
});
