import createMockRes from "test-utils/create-mock-res";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { httpProxy, getServiceWidget } = vi.hoisted(() => ({ httpProxy: vi.fn(), getServiceWidget: vi.fn() }));
vi.mock("utils/proxy/http", () => ({ httpProxy }));
vi.mock("utils/config/service-helpers", () => ({ default: getServiceWidget }));

import proxy, { summarize } from "./proxy";

const hash = (height) => height.toString(16).padStart(64, "0");
const chain = {
  chain: "main",
  blocks: 968563,
  headers: 968563,
  verificationprogress: 0.999999,
  initialblockdownload: false,
  size_on_disk: 879e9,
  bestblockhash: hash(968563),
};
const network = { subversion: "/Satoshi:31.1.0/", networkactive: true };
const peers = ["ipv4", "ipv6", "onion", "i2p", "cjdns"].map((network) => ({ network, addr: "private-peer-address" }));
const mempool = { usage: 241e6, bytes: 12e6, size: 1234 };
const req = { method: "GET", query: { group: "Bitcoin", service: "Node", endpoint: "info" } };

function serve(overrides = {}) {
  const results = {
    getblockchaininfo: chain,
    getnetworkinfo: network,
    getpeerinfo: peers,
    getmempoolinfo: mempool,
    uptime: 172800,
    ...overrides,
  };
  httpProxy.mockImplementation(async (_url, options) => {
    const requests = JSON.parse(options.body);
    const responses = requests.map(({ id, method, params }) => {
      if (method === "getblock") {
        const height = parseInt(params[0], 16);
        return {
          id,
          result: {
            height,
            size: 1650000,
            time: 1790347261,
            previousblockhash: hash(height - 1),
            tx: ["private-transaction-list"],
          },
        };
      }
      return { id, result: results[method] };
    });
    // JSON-RPC batch response order is not guaranteed.
    return [200, "application/json", Buffer.from(JSON.stringify(responses.reverse()))];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getServiceWidget.mockResolvedValue({
    type: "bitcoinnode",
    url: "http://node:8332",
    username: "rpc-user",
    password: "rpc-secret",
  });
  serve();
});

describe("Bitcoin Node RPC proxy", () => {
  it("reads a fixed set of methods and returns only summary telemetry and five coherent blocks", async () => {
    const res = createMockRes();
    await proxy({ ...req, body: { method: "sendtoaddress" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      connections: 5,
      peers: { clearnet: 2, tor: 1, i2p: 1, other: 1 },
      mempool: 241e6,
      blockchainSize: 879e9,
      uptime: 172800,
      synced: true,
      version: "Satoshi:31.1.0",
    });
    expect(res.body.blocks.map((b) => b.height)).toEqual([968563, 968562, 968561, 968560, 968559]);
    expect(httpProxy).toHaveBeenCalledTimes(6);
    for (const [, options] of httpProxy.mock.calls) {
      expect(options.auth).toBe("rpc-user:rpc-secret");
      expect(options.method).toBe("POST");
      expect(
        JSON.parse(options.body).every((r) =>
          ["getblockchaininfo", "getnetworkinfo", "getpeerinfo", "getmempoolinfo", "uptime", "getblock"].includes(
            r.method,
          ),
        ),
      ).toBe(true);
    }
    expect(JSON.stringify(res.body)).not.toMatch(/rpc-secret|private-peer|private-transaction/);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("preserves the summary when pruned history cannot be retrieved", async () => {
    const handler = httpProxy.getMockImplementation();
    httpProxy.mockImplementation((url, options) =>
      JSON.parse(options.body)[0].method === "getblock"
        ? [200, "application/json", [{ id: 0, error: { code: -1, message: "pruned" } }]]
        : handler(url, options),
    );
    const res = createMockRes();
    await proxy(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.blocksUnavailable).toBe(true);
    expect(res.body.blocks).toEqual([]);
    expect(res.body.connections).toBe(5);
  });

  it("stops at genesis and preserves valid zero readings", async () => {
    serve({
      getblockchaininfo: { ...chain, blocks: 0, headers: 0, bestblockhash: hash(0) },
      getpeerinfo: [],
      getmempoolinfo: { usage: 0, size: 0 },
      uptime: 0,
    });
    const res = createMockRes();
    await proxy(req, res);
    expect(res.body).toMatchObject({ connections: 0, mempool: 0, uptime: 0, blocksUnavailable: false });
    expect(res.body.blocks).toHaveLength(1);
    expect(httpProxy).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 500])("handles HTTP %s without leaking raw data", async (status) => {
    httpProxy.mockResolvedValue([status, "text/plain", "rpc-secret"]);
    const res = createMockRes();
    await proxy(req, res);
    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("rpc-secret");
  });

  it.each(["not-json", JSON.stringify([{ id: 0, error: { code: -28, message: "Loading block index" } }]), "[]"])(
    "rejects malformed, missing, and RPC-error results",
    async (body) => {
      httpProxy.mockResolvedValue([200, "application/json", Buffer.from(body)]);
      const res = createMockRes();
      await proxy(req, res);
      expect(res.statusCode).toBe(502);
      expect(res.body).toHaveProperty("error.message");
    },
  );

  it("rejects arbitrary endpoints and write requests before contacting the node", async () => {
    for (const request of [
      { ...req, query: { ...req.query, endpoint: "stop" } },
      { ...req, method: "POST" },
    ]) {
      const res = createMockRes();
      await proxy(request, res);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    }
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("requires server-side credentials", async () => {
    getServiceWidget.mockResolvedValue({ type: "bitcoinnode", url: "http://node:8332" });
    const res = createMockRes();
    await proxy(req, res);
    expect(res.statusCode).toBe(400);
    expect(httpProxy).not.toHaveBeenCalled();
  });

  it("does not claim sync during IBD or while blocks lag headers", () => {
    expect(summarize({ ...chain, initialblockdownload: true }, network, peers, mempool, 0).synced).toBe(false);
    expect(summarize({ ...chain, blocks: 968560 }, network, peers, mempool, 0).synced).toBe(false);
    expect(summarize(chain, { ...network, networkactive: false }, [], mempool, 0).networkActive).toBe(false);
  });
});
