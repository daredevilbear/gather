import { createServer } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";

const { getServiceWidget, logger } = vi.hoisted(() => ({
  getServiceWidget: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("utils/config/service-helpers", () => ({ default: getServiceWidget }));
vi.mock("utils/logger", () => ({ default: () => logger }));

// Deliberately use the real GameDig/Got HTTP client: a mocked GameDig.query
// would not detect a dependency update that enables shared response caching.
import gamedigProxyHandler from "./proxy";

describe("widgets/gamedig HTTP cache security assumptions", () => {
  let server;
  const sockets = new Set();

  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    vi.clearAllMocks();
  });

  it.each([
    ["fresh cacheable", "public, max-age=600"],
    ["restricted stale", "max-age=0, proxy-revalidate"],
  ])("fetches each %s response without forwarding headers or cookies", async (_label, cacheControl) => {
    const requests = [];
    server = createServer((req, res) => {
      requests.push({ url: req.url, headers: req.headers });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": cacheControl,
        "Set-Cookie": `upstream-session=synthetic-${requests.length}; HttpOnly; Path=/`,
      });
      res.end(
        JSON.stringify({
          name: `Server ${requests.length}`,
          map: "test-map",
          players: [],
          maxPlayers: 10,
          port: server.address().port,
          privateData: "synthetic-upstream-data",
        }),
      );
    });
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    getServiceWidget.mockResolvedValue({
      url: `http://127.0.0.1:${server.address().port}`,
      serverType: "eldewrito",
    });

    for (const queryNumber of [1, 2]) {
      const req = {
        query: { group: "g", service: "svc", index: "0" },
        headers: {
          "cache-control": "max-stale=2147483647",
          cookie: `dashboard-session=synthetic-${queryNumber}`,
          authorization: `Bearer synthetic-${queryNumber}`,
        },
      };
      const res = createMockRes();
      await gamedigProxyHandler(req, res);

      expect(logger.error).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        online: true,
        name: `Server ${queryNumber}`,
        map: "test-map",
        players: 0,
        maxplayers: 10,
        bots: 0,
        ping: expect.any(Number),
      });
      expect(res.headers).toEqual({});
    }

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(requests[1].url);
    for (const { headers } of requests) {
      expect(headers).not.toHaveProperty("cache-control");
      expect(headers).not.toHaveProperty("cookie");
      expect(headers).not.toHaveProperty("authorization");
    }
  });
});
