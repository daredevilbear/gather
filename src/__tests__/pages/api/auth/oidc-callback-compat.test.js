import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import http from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/gather/users-store", () => ({
  userAccess: () => ({ enabled: true, role: "admin" }),
  usersStore: () => ({ identify() {}, close() {} }),
}));
vi.mock("utils/logger", () => ({ default: () => ({ debug() {}, warn() {}, error() {} }) }));

const servers = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        }),
    ),
  );
});
async function listen(handler) {
  const server = http.createServer((req, res) =>
    Promise.resolve(handler(req, res)).catch(() => {
      res.statusCode = 500;
      res.end("Test server failure");
    }),
  );
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}
async function form(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return new URLSearchParams(body);
}
const json = (res, value) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
};

// Real NextAuth handlers and a local OIDC issuer exercise code exchange, redirect
// URI matching, PKCE, state, nonce, signed ID tokens and the resulting session.
// Only account persistence is mocked; no live IdP or deployed credentials are used.
describe("Gather and legacy OIDC callbacks", () => {
  it.each([
    ["gather-oidc", "gather-oidc"],
    ["gather-oidc", "homepage-oidc"],
    [undefined, "homepage-oidc"],
  ])("completes SSO with selection %s through callback %s", async (selection, providerId) => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
    const codes = new Map();
    let appOrigin;
    const issuer = await listen(async (req, res) => {
      const url = new URL(req.url, issuer);
      if (url.pathname === "/.well-known/openid-configuration")
        return json(res, {
          issuer,
          authorization_endpoint: issuer + "/authorize",
          token_endpoint: issuer + "/token",
          jwks_uri: issuer + "/jwks",
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          token_endpoint_auth_methods_supported: ["client_secret_basic"],
          code_challenge_methods_supported: ["S256"],
        });
      if (url.pathname === "/jwks") return json(res, { keys: [jwk] });
      if (url.pathname === "/authorize") {
        const values = Object.fromEntries(url.searchParams);
        expect(values.redirect_uri).toBe(appOrigin + "/api/auth/callback/" + providerId);
        expect(values.code_challenge_method).toBe("S256");
        expect(values.state).toBeTruthy();
        expect(values.nonce).toBeTruthy();
        const code = randomUUID();
        codes.set(code, values);
        const callback = new URL(values.redirect_uri);
        callback.searchParams.set("code", code);
        callback.searchParams.set("state", values.state);
        res.writeHead(302, { Location: callback.href });
        return res.end();
      }
      if (url.pathname === "/token") {
        const values = Object.fromEntries(await form(req));
        const auth = codes.get(values.code);
        expect(auth).toBeTruthy();
        codes.delete(values.code);
        expect(values.redirect_uri).toBe(auth.redirect_uri);
        expect(createHash("sha256").update(values.code_verifier).digest("base64url")).toBe(auth.code_challenge);
        expect(req.headers.authorization).toBe(
          "Basic " + Buffer.from("test-client:test-client-secret").toString("base64"),
        );
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url");
        const payload = Buffer.from(
          JSON.stringify({
            iss: issuer,
            aud: "test-client",
            sub: "test-admin",
            name: "Gather administrator",
            email: "admin@example.test",
            email_verified: true,
            nonce: auth.nonce,
            iat: now,
            exp: now + 300,
          }),
        ).toString("base64url");
        const input = header + "." + payload;
        return json(res, {
          token_type: "Bearer",
          access_token: "disposable-access-token",
          expires_in: 300,
          id_token: input + "." + sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url"),
        });
      }
      res.writeHead(404);
      res.end();
    });
    let authHandler;
    appOrigin = await listen(async (req, res) => {
      const url = new URL(req.url, appOrigin);
      req.query = {
        ...Object.fromEntries(url.searchParams),
        nextauth: url.pathname.slice("/api/auth/".length).split("/"),
      };
      req.cookies = Object.fromEntries(
        (req.headers.cookie || "")
          .split("; ")
          .filter(Boolean)
          .map((value) => {
            const index = value.indexOf("=");
            return [value.slice(0, index), decodeURIComponent(value.slice(index + 1))];
          }),
      );
      req.body = Object.fromEntries(await form(req));
      res.status = (status) => {
        res.statusCode = status;
        return res;
      };
      res.json = (body) => json(res, body);
      res.send = (body) => (typeof body === "object" ? res.json(body) : res.end(body));
      await authHandler(req, res);
    });
    for (const [key, value] of Object.entries({
      HOMEPAGE_AUTH_ENABLED: "true",
      HOMEPAGE_AUTH_SECRET: "disposable-session-secret-at-least-32-characters",
      HOMEPAGE_EXTERNAL_URL: appOrigin,
      NEXTAUTH_URL: appOrigin,
      NEXTAUTH_SECRET: "disposable-session-secret-at-least-32-characters",
      HOMEPAGE_OIDC_ISSUER: issuer,
      HOMEPAGE_OIDC_CLIENT_ID: "test-client",
      HOMEPAGE_OIDC_CLIENT_SECRET: "test-client-secret",
      GATHER_OIDC_PROVIDER_ID: selection,
    }))
      vi.stubEnv(key, value);
    vi.resetModules();
    authHandler = (await import("pages/api/auth/[...nextauth]")).default;
    const cookies = new Map();
    async function request(url, options = {}) {
      const response = await fetch(url, {
        ...options,
        redirect: "manual",
        headers: {
          ...options.headers,
          Cookie: [...cookies].map(([key, value]) => key + "=" + value).join("; "),
        },
      });
      for (const value of response.headers.getSetCookie()) {
        const pair = value.split(";", 1)[0],
          index = pair.indexOf("=");
        cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
      return response;
    }
    const csrf = await (await request(appOrigin + "/api/auth/csrf")).json();
    const login = await request(appOrigin + "/api/auth/signin/" + providerId, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: appOrigin + "/", json: "true" }).toString(),
    });
    const authorization = await login.json();
    expect(authorization.url).toContain(issuer + "/authorize?");
    const granted = await fetch(authorization.url, { redirect: "manual" });
    expect(granted.status).toBe(302);
    const callback = granted.headers.get("location");
    const badState = new URL(callback);
    badState.searchParams.set("state", "tampered-state");
    const denied = await request(badState.href);
    expect(denied.status).toBe(302);
    expect(denied.headers.get("location")).toContain("error=OAuthCallback");
    // Start a fresh authorization after rejection rather than reusing a code or nonce.
    const loginAgain = await request(appOrigin + "/api/auth/signin/" + providerId, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: appOrigin + "/", json: "true" }).toString(),
    });
    const again = await loginAgain.json();
    const grantAgain = await fetch(again.url, { redirect: "manual" });
    const completed = await request(grantAgain.headers.get("location"));
    expect(completed.status).toBe(302);
    expect(completed.headers.get("location")).toBe(appOrigin + "/");
    const session = await (await request(appOrigin + "/api/auth/session")).json();
    expect(session.user).toMatchObject({
      name: "Gather administrator",
      gatherIdentity: "test-admin",
      emailVerified: true,
    });
  });
});
