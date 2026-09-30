import { readFile } from "node:fs/promises";
import createMockRes from "test-utils/create-mock-res";
import getServiceWidget from "utils/config/service-helpers";
import { beforeEach, expect, it, vi } from "vitest";
import { createClient, queryClients } from "./api";
import handler from "./proxy";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
vi.mock("utils/config/service-helpers", () => ({ default: vi.fn() }));
vi.mock("./api", () => ({ createClient: vi.fn(), queryClients: vi.fn() }));
const req = {
  query: {
    group: "Security",
    service: "Velo",
    index: 1,
    endpoint: "clients",
    apiConfig: "/untrusted",
    orgId: "untrusted",
  },
};
const close = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  getServiceWidget.mockResolvedValue({ type: "velociraptor", apiConfig: "/trusted.yaml", orgId: "O.real" });
  readFile.mockResolvedValue(
    "api_connection_string: host:8001\nca_certificate: ca\nclient_private_key: secret\nclient_cert: cert\n",
  );
  createClient.mockReturnValue({ close });
  queryClients.mockResolvedValue({ total: 3, recent: 2, stale: 1 });
});
it("uses only server configuration and closes the connection", async () => {
  const res = createMockRes();
  await handler(req, res);
  expect(readFile).toHaveBeenCalledWith("/trusted.yaml", "utf8");
  expect(queryClients).toHaveBeenCalledWith({ close }, "O.real");
  expect(res.body).toEqual({ total: 3, recent: 2, stale: 1 });
  expect(close).toHaveBeenCalledOnce();
});
it("closes on errors and never leaks certificate data", async () => {
  queryClients.mockRejectedValue(new Error("secret"));
  const res = createMockRes();
  await handler(req, res);
  expect(res.statusCode).toBe(502);
  expect(JSON.stringify(res.body)).not.toContain("secret");
  expect(close).toHaveBeenCalledOnce();
});
it("rejects malformed API configuration", async () => {
  readFile.mockResolvedValue("{}");
  const res = createMockRes();
  await handler(req, res);
  expect(res.statusCode).toBe(502);
  expect(createClient).not.toHaveBeenCalled();
});
it("rejects arbitrary endpoints", async () => {
  const res = createMockRes();
  await handler({ query: { ...req.query, endpoint: "Query" } }, res);
  expect(res.statusCode).toBe(400);
  expect(readFile).not.toHaveBeenCalled();
});
