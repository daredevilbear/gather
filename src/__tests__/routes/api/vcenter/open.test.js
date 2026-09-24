import handler from "pages/api/vcenter/open";
import { servicesFromConfig } from "utils/config/service-helpers";
import { vcenterConnections } from "utils/gather/vcenter";
import { withVcenterSoap } from "utils/gather/vcenter-performance";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("utils/config/service-helpers", () => ({ servicesFromConfig: vi.fn() }));
vi.mock("utils/gather/vcenter", () => ({ vcenterConnections: vi.fn(), vcenterOrigin: (c) => c.url }));
vi.mock("utils/gather/vcenter-performance", () => ({ withVcenterSoap: vi.fn() }));
const response = () => {
  const r = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn(), redirect: vi.fn() };
  r.status.mockReturnValue(r);
  return r;
};
beforeEach(() => {
  vi.clearAllMocks();
  servicesFromConfig.mockResolvedValue([
    {
      services: [
        { vcenterServer: "lab", vcenterVM: "vm-12" },
        { vcenterServer: "lab", vcenterHost: "host-4" },
      ],
    },
  ]);
  vcenterConnections.mockResolvedValue({ lab: { url: "https://vc.test" } });
  withVcenterSoap.mockImplementation((connection, operation) =>
    operation({ instanceUuid: "12345678-1234-1234-1234-123456789abc" }),
  );
});
it.each([{ vm: "vm-12" }, { host: "host-4" }])(
  "redirects published objects to their own summary: %j",
  async (query) => {
    const res = response();
    await handler({ method: "GET", query: { instance: "lab", ...query } }, res);
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      expect.stringContaining(`:${query.vm || query.host}:12345678-1234-1234-1234-123456789abc/summary`),
    );
  },
);
it("rejects unpublished objects and malformed selectors before connecting", async () => {
  for (const query of [
    { instance: "lab", vm: "vm-99" },
    { instance: "lab", vm: ["vm-12"] },
    { instance: "lab", vm: "vm-12", host: "host-4" },
  ]) {
    const res = response();
    await handler({ method: "GET", query }, res);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(query.vm === "vm-99" ? 404 : 400);
  }
  expect(withVcenterSoap).not.toHaveBeenCalled();
});
it("does not silently fall back to the last selected VM when identity lookup fails", async () => {
  withVcenterSoap.mockRejectedValueOnce(Error("secret"));
  const res = response();
  await handler({ method: "GET", query: { instance: "lab", vm: "vm-12" } }, res);
  expect(res.status).toHaveBeenCalledWith(502);
  expect(res.redirect).not.toHaveBeenCalled();
  expect(JSON.stringify(res.json.mock.calls)).not.toContain("secret");
});
