import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("utils/logger", () => ({ default: () => ({ debug() {}, warn() {}, error() {} }) }));
let server, origin, dir, store, admin;
const password = "Disposable-local-password";
const json = (res, value) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
};
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gather-local-http-"));
  let authHandler, usersHandler, passwordHandler, dashboardHandler;
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
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
      let body = "";
      for await (const chunk of req) body += chunk;
      req.body = req.headers["content-type"]?.includes("application/json")
        ? JSON.parse(body)
        : Object.fromEntries(new URLSearchParams(body));
      res.status = (status) => {
        res.statusCode = status;
        return res;
      };
      res.json = (body) => json(res, body);
      res.send = (body) => (typeof body === "object" ? res.json(body) : res.end(body));
      const handler =
        url.pathname === "/api/gather/users"
          ? usersHandler
          : url.pathname === "/api/gather/password"
            ? passwordHandler
            : url.pathname === "/api/gather/dashboard"
              ? dashboardHandler
              : authHandler;
      await handler(req, res);
    } catch {
      res.statusCode = 500;
      res.end("Local fixture failure");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  for (const [key, value] of Object.entries({
    GATHER_AUTH_ENABLED: "true",
    GATHER_EDITOR_ENABLED: "true",
    GATHER_LOCAL_ACCOUNTS_ENABLED: "true",
    GATHER_AUTH_SECRET: "disposable-session-secret-at-least-32-characters",
    NEXTAUTH_SECRET: "disposable-session-secret-at-least-32-characters",
    GATHER_EXTERNAL_URL: origin,
    NEXTAUTH_URL: origin,
    GATHER_CONFIG_DIR: dir,
    GATHER_OIDC_ISSUER: "",
    GATHER_OIDC_CLIENT_ID: "",
    GATHER_OIDC_CLIENT_SECRET: "",
    GATHER_AUTH_PASSWORD: "",
  }))
    vi.stubEnv(key, value);
  vi.resetModules();
  store = (await import("utils/gather/users-store")).usersStore();
  for (const [username, role] of [
    ["admin", "admin"],
    ["editor", "editor"],
    ["viewer", "viewer"],
  ])
    store.addLocal({ name: username, email: username + "@example.test", username, role, password }, "Setup");
  admin = (await store.authenticate("admin", password)).id;
  vi.stubEnv("GATHER_ADMIN_IDS", admin);
  authHandler = (await import("pages/api/auth/[...nextauth]")).default;
  usersHandler = (await import("pages/api/gather/users")).default;
  passwordHandler = (await import("pages/api/gather/password")).default;
  dashboardHandler = (await import("pages/api/gather/dashboard")).default;
});
afterEach(async () => {
  store?.close();
  if (server)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});
function browser() {
  const cookies = new Map();
  const request = async (pathname, options = {}) => {
    const response = await fetch(origin + pathname, {
      ...options,
      redirect: "manual",
      headers: {
        ...options.headers,
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      },
    });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";", 1)[0],
        index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
  return {
    request,
    session: async () => (await request("/api/auth/session")).json(),
    async login(username, provided = password, invalidCsrf = false) {
      const csrf = await (await request("/api/auth/csrf")).json();
      return request("/api/auth/callback/local", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username,
          password: provided,
          csrfToken: invalidCsrf ? "tampered" : csrf.csrfToken,
          callbackUrl: origin + "/",
          json: "true",
        }).toString(),
      });
    },
    post: (pathname, body, foreignOrigin = false) =>
      request(pathname, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: foreignOrigin ? "https://foreign.test" : origin,
          "X-Gather-Editor": "1",
        },
        body: JSON.stringify(body),
      }),
  };
}
it("performs real local login with separate identities, roles and CSRF rejection", async () => {
  const attacker = browser();
  await attacker.login("admin", password, true);
  expect(await attacker.session()).toEqual({});
  const invalid = await attacker.login("admin", "wrong-password");
  expect((await invalid.json()).url).toContain("CredentialsSignin");
  expect(await attacker.session()).toEqual({});
  const first = browser(),
    second = browser();
  await first.login("admin");
  await second.login("editor");
  expect((await first.session()).user).toMatchObject({ role: "admin", gatherIdentity: admin, emailVerified: false });
  const editor = (await second.session()).user;
  expect(editor).toMatchObject({ role: "editor", emailVerified: false });
  expect(editor.gatherIdentity).not.toBe(admin);
  expect((await first.request("/api/gather/users")).status).toBe(200);
  expect((await second.request("/api/gather/users")).status).toBe(403);
});
it("allows administrator-created accounts, rejects viewer edits and cross-origin writes, and revokes reset sessions", async () => {
  const administrator = browser(),
    viewer = browser();
  await administrator.login("admin");
  await viewer.login("viewer");
  const input = {
    action: "add",
    name: "New editor",
    email: "new@example.test",
    username: "new-editor",
    password,
    role: "editor",
  };
  expect((await administrator.post("/api/gather/users", input, true)).status).toBe(403);
  const added = await administrator.post("/api/gather/users", input);
  expect(added.status).toBe(200);
  const directory = await added.json();
  expect(JSON.stringify(directory)).not.toMatch(/salt|hash|Disposable-local-password/);
  const user = directory.users.find((user) => user.username === "new-editor");
  const newcomer = browser();
  await newcomer.login("new-editor");
  expect((await newcomer.session()).user.role).toBe("editor");
  expect((await viewer.post("/api/gather/users", input)).status).toBe(403);
  const document = { revision: 0, dashboard: { title: "Private", links: [] } };
  expect((await viewer.post("/api/gather/dashboard", document)).status).toBe(403);
  expect((await newcomer.post("/api/gather/dashboard", document)).status).toBe(200);
  expect((await viewer.request("/api/gather/dashboard")).status).toBe(200);
  expect((await (await viewer.request("/api/gather/dashboard")).json()).dashboard.title).not.toBe("Private");
  expect(
    (
      await administrator.post("/api/gather/users", {
        action: "resetPassword",
        id: user.id,
        password: "Replacement-local-password",
      })
    ).status,
  ).toBe(200);
  expect((await newcomer.session()).user).toBeNull();
  expect((await newcomer.request("/api/gather/dashboard")).status).toBe(403);
  await newcomer.login("new-editor", "Replacement-local-password");
  expect((await newcomer.session()).user.role).toBe("editor");
  await administrator.post("/api/gather/users", { action: "update", id: user.id, role: "editor", enabled: false });
  expect((await newcomer.session()).user).toBeNull();
  const disabled = browser();
  await disabled.login("new-editor", "Replacement-local-password");
  expect(await disabled.session()).toEqual({});
});
it("changes the protected administrator password only with its current password and ends old sessions", async () => {
  const first = browser(),
    second = browser();
  await first.login("admin");
  await second.login("admin");
  const change = { currentPassword: password, password: "Replacement-admin-password" };
  expect((await first.post("/api/gather/password", change, true)).status).toBe(403);
  expect((await first.post("/api/gather/password", { ...change, currentPassword: "wrong-password" })).status).toBe(400);
  expect((await first.post("/api/gather/password", change)).status).toBe(200);
  expect((await second.session()).user).toBeNull();
  expect((await second.request("/api/gather/users")).status).toBe(403);
  await first.login("admin", change.password);
  expect((await first.session()).user.gatherIdentity).toBe(admin);
});
