import cache from "memory-cache";
import createMockRes from "test-utils/create-mock-res";
import getServiceWidget from "utils/config/service-helpers";
import { httpProxy } from "utils/proxy/http";
import { beforeEach, expect, it, vi } from "vitest";
import handler from "./proxy";

vi.mock("utils/config/service-helpers", () => ({ default: vi.fn() }));
vi.mock("utils/proxy/http", () => ({ httpProxy: vi.fn() }));
const req = { query: { group: "Security", service: "Wazuh", index: 0, endpoint: "agents/summary/status" } };
const widget = { type: "wazuh", url: "https://wazuh:55000", username: "reader", password: "secret" };
const summary = { total: 4, active: 1, disconnected: 1, pending: 1, never_connected: 1 };
const reply = (body, status = 200) => [status, "application/json", Buffer.from(JSON.stringify(body))];
beforeEach(() => {
  vi.resetAllMocks();
  cache.clear();
  getServiceWidget.mockResolvedValue(widget);
});
it("authenticates directly and returns only counts; reuses the token", async () => {
  httpProxy
    .mockResolvedValueOnce(reply({ data: { token: "jwt" } }))
    .mockResolvedValue(reply({ data: { connection: summary }, error: 0 }));
  const res = createMockRes();
  await handler(req, res);
  await handler(req, createMockRes());
  expect(res.body).toEqual(summary);
  expect(httpProxy).toHaveBeenCalledTimes(3);
  expect(httpProxy.mock.calls[1][0]).toBe("https://wazuh:55000/agents/summary/status");
  expect(httpProxy.mock.calls[1][1].headers.Authorization).toBe("Bearer jwt");
});
it("refreshes once after an expired token", async () => {
  httpProxy
    .mockResolvedValueOnce(reply({ data: { token: "old" } }))
    .mockResolvedValueOnce(reply({}, 401))
    .mockResolvedValueOnce(reply({ data: { token: "new" } }))
    .mockResolvedValueOnce(reply({ data: { connection: summary } }));
  const res = createMockRes();
  await handler(req, res);
  expect(res.statusCode).toBe(200);
  expect(httpProxy.mock.calls[3][1].headers.Authorization).toBe("Bearer new");
});
it.each([{}, { data: { connection: { ...summary, active: -1 } } }, { error: 1000, data: { connection: summary } }])(
  "rejects invalid upstream data",
  async (body) => {
    httpProxy.mockResolvedValueOnce(reply({ data: { token: "jwt" } })).mockResolvedValueOnce(reply(body));
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(502);
  },
);
it("does not share tokens after credentials change", async () => {
  httpProxy
    .mockResolvedValueOnce(reply({ data: { token: "a" } }))
    .mockResolvedValueOnce(reply({ data: { connection: summary } }))
    .mockResolvedValueOnce(reply({ data: { token: "b" } }))
    .mockResolvedValueOnce(reply({ data: { connection: summary } }));
  await handler(req, createMockRes());
  getServiceWidget.mockResolvedValue({ ...widget, password: "changed" });
  await handler(req, createMockRes());
  expect(httpProxy).toHaveBeenCalledTimes(4);
});
it("rejects arbitrary endpoints without making requests", async () => {
  const res = createMockRes();
  await handler({ query: { ...req.query, endpoint: "agents/delete" } }, res);
  expect(res.statusCode).toBe(400);
  expect(httpProxy).not.toHaveBeenCalled();
});
