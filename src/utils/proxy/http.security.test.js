import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

vi.mock("utils/logger", () => ({ default: () => ({ debug() {}, error() {} }) }));

// Exercise the real TLS stack and follow-redirects package, not mocked transports.
import { httpProxy } from "./http";

let directory;
const servers = [];
const certificates = {};

function openssl(...args) {
  execFileSync("openssl", args, { stdio: "ignore" });
}

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "gather-http-security-"));
  for (const hostname of ["localhost", "other.invalid"]) {
    const key = path.join(directory, `${hostname}.key`);
    const cert = path.join(directory, `${hostname}.pem`);
    openssl(
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
      `/CN=${hostname}`,
      "-addext",
      `subjectAltName=DNS:${hostname}`,
    );
    certificates[hostname] = { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
  }

  // Fixed past validity dates keep the expiration check independent of test time.
  const config = path.join(directory, "ca.cnf");
  fs.writeFileSync(path.join(directory, "index"), "");
  fs.writeFileSync(path.join(directory, "serial"), "01\n");
  fs.writeFileSync(
    config,
    `[ca]\ndefault_ca=fixture\n[fixture]\ndatabase=${directory}/index\nserial=${directory}/serial\nnew_certs_dir=${directory}\ndefault_md=sha256\npolicy=policy\n[policy]\ncommonName=supplied\n`,
  );
  const csr = path.join(directory, "expired.csr");
  const cert = path.join(directory, "expired.pem");
  const key = path.join(directory, "localhost.key");
  openssl("req", "-new", "-key", key, "-out", csr, "-subj", "/CN=localhost");
  openssl(
    "ca",
    "-selfsign",
    "-batch",
    "-notext",
    "-config",
    config,
    "-keyfile",
    key,
    "-cert",
    path.join(directory, "localhost.pem"),
    "-in",
    csr,
    "-out",
    cert,
    "-startdate",
    "20000101000000Z",
    "-enddate",
    "20000102000000Z",
  );
  certificates.expired = { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
});

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});

afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

async function listen(server, protocol, hostname = "localhost") {
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `${protocol}://${hostname}:${server.address().port}`;
}

async function tlsFixture(certificate) {
  const received = [];
  const url = await listen(
    https.createServer(certificate, (req, res) => {
      received.push(req.headers);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    }),
    "https",
  );
  return { url, received };
}

it("rejects an untrusted integration before transmitting credentials", async () => {
  const { url, received } = await tlsFixture(certificates.localhost);
  const [status, , data] = await httpProxy(url, { headers: { Authorization: "Bearer synthetic-token" } });
  expect(status).toBe(500);
  expect(data.error.message).toMatch(/self.signed certificate/i);
  expect(received).toEqual([]);
});

it("allows a trusted private CA with a matching hostname", async () => {
  const { url, received } = await tlsFixture(certificates.localhost);
  const [status, , data] = await httpProxy(url, { ca: certificates.localhost.cert });
  expect(status).toBe(200);
  expect(JSON.parse(data.toString())).toEqual({ ok: true });
  expect(received).toHaveLength(1);
});

it("rejects a trusted certificate for a different hostname", async () => {
  const { url, received } = await tlsFixture(certificates["other.invalid"]);
  const [status, , data] = await httpProxy(url, { ca: certificates["other.invalid"].cert });
  expect(status).toBe(500);
  expect(data.error.rawError.code).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
  expect(received).toEqual([]);
});

it("rejects an expired trusted certificate", async () => {
  const { url, received } = await tlsFixture(certificates.expired);
  const [status, , data] = await httpProxy(url, { ca: certificates.expired.cert });
  expect(status).toBe(500);
  expect(data.error.rawError.code).toBe("CERT_HAS_EXPIRED");
  expect(received).toEqual([]);
});

it("strips cross-realm sensitive headers on a cross-origin redirect", async () => {
  const received = [];
  const destination = await listen(
    http.createServer((req, res) => {
      received.push(req.headers);
      res.end("redirected");
    }),
    "http",
    "127.0.0.1",
  );
  const source = await listen(
    http.createServer((_req, res) => {
      res.writeHead(302, { Location: destination });
      res.end();
    }),
    "http",
    "127.0.0.1",
  );
  const [status, , data] = await httpProxy(source, {
    headers: { "X-API-Key": "synthetic-secret", "X-Harmless": "retained" },
    sensitiveHeaders: vm.runInNewContext("['X-API-Key']"),
  });
  expect(status).toBe(200);
  expect(data.toString()).toBe("redirected");
  expect(received).toHaveLength(1);
  expect(received[0]).not.toHaveProperty("x-api-key");
  expect(received[0]["x-harmless"]).toBe("retained");
});
