import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";

import createMockRes from "test-utils/create-mock-res";

vi.mock("utils/config/service-helpers", () => ({ default: vi.fn() }));
vi.mock("utils/logger", () => ({ default: () => ({ debug() {}, warn() {}, error() {} }) }));
vi.mock("utils/proxy/validate-widget-data", () => ({ default: () => true }));
vi.mock("widgets/widgets", () => ({
  default: {
    truenas: { wsAPI: "{url}/websocket", mappings: { stats: { endpoint: "stats", wsMethod: "system.info" } } },
  },
}));

import getServiceWidget from "utils/config/service-helpers";
import handler from "./proxy";

let directory, server, sockets, origin;
const received = [];
beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "gather-truenas-tls-"));
  const key = path.join(directory, "key.pem"),
    cert = path.join(directory, "cert.pem");
  // Generate a disposable, explicitly untrusted test certificate, never a real credential.
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:P-256",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
    ],
    { stdio: "ignore" },
  );
  server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) });
  sockets = new WebSocketServer({ server });
  sockets.on("connection", (socket) =>
    socket.on("message", (body) => {
      const message = JSON.parse(body.toString());
      received.push(message);
      socket.send(JSON.stringify({ id: message.id, result: message.method === "system.info" ? { ok: true } : true }));
    }),
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `https://localhost:${server.address().port}`;
});
afterAll(async () => {
  for (const socket of sockets?.clients || []) socket.terminate();
  sockets?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

it("rejects an untrusted TrueNAS TLS server before sending authentication", async () => {
  getServiceWidget.mockResolvedValue({ type: "truenas", url: origin, version: 2, key: "disposable-api-key" });
  const res = createMockRes();
  await handler({ query: { group: "fixture", service: "TrueNAS", endpoint: "stats" } }, res);
  expect(res.statusCode).toBe(500);
  expect(res.body.error).toMatch(/self.signed certificate/i);
  expect(received).toEqual([]);
});
