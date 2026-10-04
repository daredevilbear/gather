import { beforeEach, describe, expect, it, vi } from "vitest";

import createMockRes from "test-utils/create-mock-res";

const { getServiceWidget, validateWidgetData, logger, sockets, connectError } = vi.hoisted(() => ({
  getServiceWidget: vi.fn(),
  sockets: [],
  connectError: { value: null },
  validateWidgetData: vi.fn(() => true),
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("utils/logger", () => ({
  default: () => logger,
}));
vi.mock("utils/config/service-helpers", () => ({
  default: getServiceWidget,
}));
vi.mock("utils/proxy/validate-widget-data", () => ({
  default: validateWidgetData,
}));
vi.mock("utils/proxy/handlers/credentialed", () => ({
  default: vi.fn(),
}));
vi.mock("widgets/widgets", () => ({
  default: {
    truenas: {
      wsAPI: "{url}/websocket",
      mappings: {
        stats: { endpoint: "stats", wsMethod: "system.info" },
      },
    },
  },
}));

vi.mock("ws", () => {
  class FakeWebSocket {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.sent = [];
      sockets.push(this);
      this._handlers = new Map();
    }
    on(event, cb) {
      const set = this._handlers.get(event) ?? new Set();
      set.add(cb);
      this._handlers.set(event, set);
      if (event === "open" && !connectError.value) {
        queueMicrotask(() => cb());
      }
      if (event === "error" && connectError.value) {
        queueMicrotask(() => cb(connectError.value));
      }
    }
    off(event, cb) {
      const set = this._handlers.get(event);
      if (set) set.delete(cb);
    }
    send(payload) {
      this.sent.push(payload);
      const msg = JSON.parse(payload);
      let result = true;
      if (msg.method === "system.info") {
        result = { ok: true };
      }
      queueMicrotask(() => {
        const set = this._handlers.get("message");
        if (!set) return;
        set.forEach((cb) => cb(JSON.stringify({ id: msg.id, result })));
      });
    }
    close() {}
  }

  return { default: FakeWebSocket };
});

import truenasProxyHandler from "./proxy";

describe("widgets/truenas/proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sockets.length = 0;
    connectError.value = null;
    validateWidgetData.mockReturnValue(true);
  });

  it("uses websocket calls for v2+ and returns JSON result", async () => {
    getServiceWidget.mockResolvedValue({
      type: "truenas",
      url: "http://tn",
      version: 2,
      key: "apikey",
    });

    const req = { query: { group: "g", service: "svc", endpoint: "stats", index: "0" } };
    const res = createMockRes();

    await truenasProxyHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sockets[0].url.protocol).toBe("wss:");
    expect(sockets[0].options.rejectUnauthorized).toBe(true);
  });

  it("requires verified TLS for username/password authentication too", async () => {
    getServiceWidget.mockResolvedValue({
      type: "truenas",
      url: "http://tn",
      version: 2,
      username: "user",
      password: "password",
    });
    const res = createMockRes();
    await truenasProxyHandler({ query: { group: "g", service: "svc", endpoint: "stats" } }, res);
    expect(res.statusCode).toBe(200);
    expect(sockets[0].url.protocol).toBe("wss:");
    expect(sockets[0].options.rejectUnauthorized).toBe(true);
  });

  it("does not send credentials when certificate verification fails", async () => {
    connectError.value = new Error("self-signed certificate");
    getServiceWidget.mockResolvedValue({ type: "truenas", url: "https://tn", version: 2, key: "private-api-key" });
    const res = createMockRes();
    await truenasProxyHandler({ query: { group: "g", service: "svc", endpoint: "stats" } }, res);
    expect(res.statusCode).toBe(500);
    expect(sockets[0].sent).toEqual([]);
    expect(JSON.stringify([res.body, logger.error.mock.calls])).not.toContain("private-api-key");
  });
});
