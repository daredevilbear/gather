import { expect, it, vi } from "vitest";
import { vcenterInventory } from "./vcenter";
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
    { name: "Example", powerState: "POWERED_ON", cpus: 2, memoryMiB: 2048 },
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
