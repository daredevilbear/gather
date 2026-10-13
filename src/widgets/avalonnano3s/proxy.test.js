import { beforeEach, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";
import getServiceWidget from "utils/config/service-helpers";
import { queryMiner } from "./client";
import { stats, summary } from "./fixtures";
import handler from "./proxy";

vi.mock("utils/config/service-helpers", () => ({ default: vi.fn() }));
vi.mock("./client", async (original) => ({ ...(await original()), queryMiner: vi.fn() }));
const req = { query: { group: "Mining", service: "Nano 3s", index: 0, endpoint: "info" } };
beforeEach(() => {
  vi.resetAllMocks();
  getServiceWidget.mockResolvedValue({ type: "avalonnano3s", url: "http://192.168.8.54" });
  queryMiner.mockImplementation(async (_address, command) => (command === "summary" ? summary : stats));
});
it("uses the configured miner, only read-only commands, and returns sanitized data", async () => {
  const res = createMockRes();
  await handler({ ...req, body: { command: "reboot" } }, res);
  expect(res.statusCode).toBe(200);
  expect(queryMiner.mock.calls).toEqual([
    [{ host: "192.168.8.54", port: 4028 }, "summary"],
    [{ host: "192.168.8.54", port: 4028 }, "estats"],
  ]);
  expect(res.body.temperature).toBe(80);
  expect(JSON.stringify(res.body)).not.toContain("private-device-id");
});
it.each(["reboot", "setpool", undefined])("rejects unmapped endpoint %s", async (endpoint) => {
  const res = createMockRes();
  await handler({ query: { ...req.query, endpoint } }, res);
  expect(res.statusCode).toBe(400);
  expect(queryMiner).not.toHaveBeenCalled();
});
it("refuses a different widget type", async () => {
  getServiceWidget.mockResolvedValue({ type: "bitaxe", url: "http://other" });
  const res = createMockRes();
  await handler(req, res);
  expect(res.statusCode).toBe(400);
  expect(queryMiner).not.toHaveBeenCalled();
});
it("does not leak upstream errors or render stale success on failure", async () => {
  queryMiner.mockRejectedValue(new Error("secret raw device data"));
  const res = createMockRes();
  await handler(req, res);
  expect(res.statusCode).toBe(502);
  expect(res.body.error).not.toContain("secret");
  expect(res.body).not.toHaveProperty("hashRate");
});
