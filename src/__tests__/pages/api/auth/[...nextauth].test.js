import { beforeEach, describe, expect, it, vi } from "vitest";

const { debugMock, errorMock, nextAuthMock, warnMock } = vi.hoisted(() => ({
  debugMock: vi.fn(),
  errorMock: vi.fn(),
  nextAuthMock: vi.fn((options) => ({ options })),
  warnMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: nextAuthMock,
}));

vi.mock("utils/logger", () => ({
  default: vi.fn(() => ({ debug: debugMock, error: errorMock, warn: warnMock })),
}));

describe("pages/api/auth/[...nextauth]", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    debugMock.mockClear();
    errorMock.mockClear();
    nextAuthMock.mockClear();
    warnMock.mockClear();
    process.env = { ...originalEnv };
    delete process.env.GATHER_EXTERNAL_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_URL;
    delete process.env.GATHER_OIDC_PROVIDER_ID;
  });

  it("configures no providers when auth is disabled", async () => {
    const mod = await import("pages/api/auth/[...nextauth]");

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
    expect(mod.authOptions.providers).toEqual([]);
    expect(mod.authOptions.pages?.signIn).toBe("/auth/signin");
  });

  it("answers the session endpoint with an empty session when auth is disabled", async () => {
    const mod = await import("pages/api/auth/[...nextauth]");
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json, end: vi.fn() })) };

    await mod.default({ query: { nextauth: ["session"] } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({});
    expect(nextAuthMock).toHaveBeenCalledTimes(1); // built at import, never invoked per-request
  });

  it.each([["providers"], ["csrf"], ["signin"]])(
    "answers the %s endpoint with parseable JSON when auth is disabled",
    async (endpoint) => {
      const mod = await import("pages/api/auth/[...nextauth]");
      const json = vi.fn();
      const res = { status: vi.fn(() => ({ json, end: vi.fn() })) };

      await mod.default({ query: { nextauth: [endpoint] } }, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({});
    },
  );

  it("does not enable NextAuth's raw debug logger", async () => {
    const mod = await import("pages/api/auth/[...nextauth]");

    expect(mod.authOptions).not.toHaveProperty("debug");
  });

  it("routes sanitized NextAuth logs through the Gather logger", async () => {
    const mod = await import("pages/api/auth/[...nextauth]");
    const sensitiveMetadata = {
      error: Object.assign(new Error("State cookie was missing."), { access_token: "sensitive-access-token" }),
      clientSecret: "sensitive-client-secret",
      access_token: "sensitive-access-token",
      id_token: "sensitive-id-token",
    };

    mod.authOptions.logger.error("OAUTH_CALLBACK_ERROR", sensitiveMetadata);
    mod.authOptions.logger.warn("NEXTAUTH_URL", sensitiveMetadata);
    mod.authOptions.logger.debug("OAUTH_CALLBACK_RESPONSE", sensitiveMetadata);

    expect(errorMock).toHaveBeenCalledWith("%s: %s", "OAUTH_CALLBACK_ERROR", "State cookie was missing.");
    expect(warnMock).toHaveBeenCalledWith("%s", "NEXTAUTH_URL");
    expect(debugMock).toHaveBeenCalledWith("%s", "OAUTH_CALLBACK_RESPONSE");
    expect(JSON.stringify([...errorMock.mock.calls, ...warnMock.mock.calls, ...debugMock.mock.calls])).not.toContain(
      "sensitive",
    );
  });

  it("logs only sanitized authentication lifecycle events", async () => {
    const mod = await import("pages/api/auth/[...nextauth]");

    await mod.authOptions.events.signIn({
      account: {
        provider: "gather-oidc",
        access_token: "sensitive-access-token",
        id_token: "sensitive-id-token",
      },
      user: { email: "sensitive@example.com" },
    });
    await mod.authOptions.events.signOut({ token: { sub: "sensitive-user-id" } });

    expect(debugMock).toHaveBeenNthCalledWith(1, "Sign in via provider '%s'", "gather-oidc");
    expect(debugMock).toHaveBeenNthCalledWith(2, "Sign out");
    expect(JSON.stringify(debugMock.mock.calls)).not.toContain("sensitive");
  });

  it("maps GATHER_AUTH_SECRET and GATHER_EXTERNAL_URL to NextAuth envs", async () => {
    process.env.GATHER_AUTH_SECRET = "secret";
    process.env.GATHER_EXTERNAL_URL = "https://gather.example";

    const mod = await import("pages/api/auth/[...nextauth]");

    expect(process.env.NEXTAUTH_SECRET).toBe("secret");
    expect(process.env.NEXTAUTH_URL).toBe("https://gather.example");
    expect(mod.authOptions.secret).toBe("secret");
  });

  it("throws when auth is enabled without an external URL", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_PASSWORD = "secret";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";

    await expect(import("pages/api/auth/[...nextauth]")).rejects.toThrow(/GATHER_EXTERNAL_URL.*is missing/i);
  });

  it.each([
    "gather.example",
    "ftp://gather.example",
    "https://user:password@gather.example",
    "https://gather.example/?unexpected=true",
    "https://gather.example/#unexpected",
  ])("rejects invalid external URL %s", async (externalUrl) => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_PASSWORD = "secret";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";
    process.env.GATHER_EXTERNAL_URL = externalUrl;

    await expect(import("pages/api/auth/[...nextauth]")).rejects.toThrow(/absolute HTTP\(S\) URL/i);
  });

  it("throws when auth is enabled but no provider settings are present", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";
    process.env.GATHER_EXTERNAL_URL = "https://gather.example";

    await expect(import("pages/api/auth/[...nextauth]")).rejects.toThrow(
      /Password auth is enabled but required settings are missing/i,
    );
  });

  it.each(["short", "a".repeat(31)])("throws when the auth secret is too weak (%j)", async (secret) => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_PASSWORD = "secret";
    process.env.GATHER_AUTH_SECRET = secret;
    process.env.GATHER_EXTERNAL_URL = "https://gather.example";

    await expect(import("pages/api/auth/[...nextauth]")).rejects.toThrow(/at least 32 characters/i);
  });

  it("accepts an auth secret at exactly the minimum length", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_PASSWORD = "secret";
    process.env.GATHER_AUTH_SECRET = "a".repeat(32);
    process.env.GATHER_EXTERNAL_URL = "https://gather.example";

    const mod = await import("pages/api/auth/[...nextauth]");

    expect(mod.authOptions.providers).toHaveLength(1);
  });

  it("does not enforce the secret length when auth is disabled", async () => {
    process.env.GATHER_AUTH_SECRET = "short";

    const mod = await import("pages/api/auth/[...nextauth]");

    expect(mod.authOptions.providers).toEqual([]);
  });

  it("builds a password provider when auth is enabled without OIDC config", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_PASSWORD = "secret";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";
    process.env.GATHER_EXTERNAL_URL = "https://gather.example";

    const mod = await import("pages/api/auth/[...nextauth]");
    const [provider] = mod.authOptions.providers;

    expect(provider.id).toBe("credentials");
    expect(provider.name).toBe("Credentials");
    expect(provider.type).toBe("credentials");
    expect(typeof provider.authorize).toBe("function");
    expect(mod.authOptions.useSecureCookies).toBe(true);
    await expect(provider.options.authorize({ password: "secret" })).resolves.toEqual({
      id: "gather",
      name: "Gather",
    });
    await expect(provider.options.authorize({ password: "wrong" })).resolves.toBeNull();
    await expect(provider.options.authorize({ password: 123 })).resolves.toBeNull();
  });

  it("logs failed password sign-in attempts without recording client-supplied data", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_PASSWORD = "secret";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";
    process.env.GATHER_EXTERNAL_URL = "https://gather.example";

    const mod = await import("pages/api/auth/[...nextauth]");
    const [provider] = mod.authOptions.providers;

    await provider.options.authorize({ password: "wrong" });
    await provider.options.authorize({ password: 123 });

    expect(warnMock).toHaveBeenCalledTimes(2);
    expect(warnMock).toHaveBeenCalledWith("Failed password sign-in attempt");
    // the attempted password must never reach the logs
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain("wrong");

    warnMock.mockClear();
    await provider.options.authorize({ password: "secret" });
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("compares multibyte passwords without throwing on unequal byte lengths", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_PASSWORD = "é";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";
    process.env.GATHER_EXTERNAL_URL = "https://gather.example";

    const mod = await import("pages/api/auth/[...nextauth]");
    const [provider] = mod.authOptions.providers;

    await expect(provider.options.authorize({ password: "a" })).resolves.toBeNull();
    await expect(provider.options.authorize({ password: "é" })).resolves.toEqual({
      id: "gather",
      name: "Gather",
    });
  });

  it("supports trusted HTTP deployments without Secure cookies", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_PASSWORD = "secret";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";
    process.env.GATHER_EXTERNAL_URL = "http://192.168.1.20:3000";

    const mod = await import("pages/api/auth/[...nextauth]");

    expect(process.env.NEXTAUTH_URL).toBe("http://192.168.1.20:3000");
    expect(mod.authOptions.useSecureCookies).toBe(false);
  });

  it("accepts an explicitly configured NEXTAUTH_URL", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_AUTH_PASSWORD = "secret";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";
    process.env.NEXTAUTH_URL = "https://gather.example";

    const mod = await import("pages/api/auth/[...nextauth]");

    expect(mod.authOptions.useSecureCookies).toBe(true);
  });

  it("builds an OIDC provider when enabled and maps profile fields", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_OIDC_ISSUER = "https://issuer.example/";
    process.env.GATHER_OIDC_CLIENT_ID = "client-id";
    process.env.GATHER_OIDC_CLIENT_SECRET = "client-secret";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";
    process.env.GATHER_EXTERNAL_URL = "https://gather.example";
    process.env.GATHER_OIDC_NAME = "My OIDC";
    process.env.GATHER_OIDC_SCOPE = "openid email";

    const mod = await import("pages/api/auth/[...nextauth]");
    const [provider] = mod.authOptions.providers;

    expect(provider).toMatchObject({
      id: "gather-oidc",
      name: "My OIDC",
      type: "oauth",
      idToken: true,
      checks: ["pkce", "state", "nonce"],
      issuer: "https://issuer.example",
      wellKnown: "https://issuer.example/.well-known/openid-configuration",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    expect(provider.authorization.params.scope).toBe("openid email");

    expect(
      provider.profile({
        sub: "sub",
        preferred_username: "user",
        email: "user@example.com",
        picture: "https://example.com/p.png",
      }),
    ).toEqual({
      id: "sub",
      name: "user",
      email: "user@example.com",
      image: "https://example.com/p.png",
    });

    expect(
      provider.profile({
        id: "id",
        name: "name",
      }),
    ).toEqual({
      id: "id",
      name: "name",
      email: null,
      image: null,
    });
  });

  it.each([undefined, "gather-oidc"])("registers one Gather callback with selection %s", async (id) => {
    Object.assign(process.env, {
      GATHER_AUTH_ENABLED: "true",
      GATHER_AUTH_SECRET: "test-session-secret-that-is-at-least-32-characters",
      GATHER_EXTERNAL_URL: "https://gather.example.test",
      GATHER_OIDC_ISSUER: "https://identity.example.test",
      GATHER_OIDC_CLIENT_ID: "gather",
      GATHER_OIDC_CLIENT_SECRET: "test-client-secret",
    });
    if (id) process.env.GATHER_OIDC_PROVIDER_ID = id;
    const { authOptions } = await import("pages/api/auth/[...nextauth]");
    expect(authOptions.providers.map((p) => p.id)).toEqual(["gather-oidc"]);
    expect(authOptions.providers[0].name).toBe("Gather OIDC");
    expect(authOptions.providers[0].checks).toEqual(["pkce", "state", "nonce"]);
  });

  it("rejects an unsupported callback selection", async () => {
    Object.assign(process.env, {
      GATHER_AUTH_ENABLED: "true",
      GATHER_AUTH_SECRET: "test-session-secret-that-is-at-least-32-characters",
      GATHER_EXTERNAL_URL: "https://gather.example.test",
      GATHER_OIDC_ISSUER: "https://identity.example.test",
      GATHER_OIDC_CLIENT_ID: "gather",
      GATHER_OIDC_CLIENT_SECRET: "test-client-secret",
      GATHER_OIDC_PROVIDER_ID: "unexpected-provider",
    });
    await expect(import("pages/api/auth/[...nextauth]")).rejects.toThrow("GATHER_OIDC_PROVIDER_ID");
  });

  it("preserves an explicitly configured shared-password identity", async () => {
    Object.assign(process.env, {
      GATHER_AUTH_ENABLED: "true",
      GATHER_AUTH_PASSWORD: "disposable-password",
      GATHER_AUTH_SECRET: "session-secret-that-is-at-least-32-characters",
      GATHER_EXTERNAL_URL: "https://gather.example.test",
      GATHER_PASSWORD_USER_ID: "existing-account",
    });
    const { authOptions } = await import("pages/api/auth/[...nextauth]");
    expect(await authOptions.providers[0].options.authorize({ password: "disposable-password" })).toEqual({
      id: "existing-account",
      name: "Gather",
    });
  });

  it("throws when only partial OIDC settings are provided", async () => {
    process.env.GATHER_AUTH_ENABLED = "true";
    process.env.GATHER_OIDC_ISSUER = "https://issuer.example";
    process.env.GATHER_AUTH_SECRET = "rk3Xk9wQ0mVJt7cZbN2yLpA8sHdF4gRuEwTiOaSvBnM=";
    process.env.GATHER_EXTERNAL_URL = "https://gather.example";

    await expect(import("pages/api/auth/[...nextauth]")).rejects.toThrow(
      /OIDC auth is enabled but required settings are missing/i,
    );
  });
});
