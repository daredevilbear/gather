import { getToken } from "next-auth/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { administrator, systemAdministrator, validEditorOrigin } from "./admin";
import { userAccess } from "./users-store";
vi.mock("./users-store", () => ({
  userAccess: vi.fn(() => ({ role: "viewer", enabled: true })),
  bootstrapAdmin: vi.fn(() => false),
}));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("editor authorization", () => {
  it("denies anonymous users, viewers and unconfigured installations", async () => {
    vi.stubEnv("GATHER_AUTH_ENABLED", "true");
    vi.stubEnv("GATHER_EDITOR_ENABLED", "true");
    vi.stubEnv("GATHER_ADMIN_IDS", "admin-sub");
    getToken.mockResolvedValue(null);
    expect(await administrator({})).toBe(false);
    getToken.mockResolvedValue({ sub: "viewer", email: "admin@example.test" });
    expect(await administrator({})).toBe(false);
    getToken.mockResolvedValue({ sub: "admin-sub" });
    expect(await administrator({})).toBe(true);
    vi.stubEnv("GATHER_EDITOR_ENABLED", "false");
    expect(await administrator({})).toBe(false);
    vi.stubEnv("GATHER_EDITOR_ENABLED", "true");
    vi.stubEnv("GATHER_AUTH_ENABLED", "false");
    expect(await administrator({})).toBe(false);
  });
  it("requires exact configured origin and custom request header", () => {
    vi.stubEnv("GATHER_EXTERNAL_URL", "https://dashboard.example.test");
    expect(validEditorOrigin({ headers: { origin: "https://dashboard.example.test", "x-gather-editor": "1" } })).toBe(
      true,
    );
    expect(validEditorOrigin({ headers: { origin: "https://evil.test", "x-gather-editor": "1" } })).toBe(false);
    expect(validEditorOrigin({ headers: { origin: "https://dashboard.example.test" } })).toBe(false);
  });
});

it("keeps native administrators outside protected system configuration", async () => {
  vi.stubEnv("GATHER_AUTH_ENABLED", "true");
  vi.stubEnv("GATHER_EDITOR_ENABLED", "true");
  vi.stubEnv("GATHER_ADMIN_IDS", "bootstrap");
  getToken.mockResolvedValue({ sub: "member" });
  userAccess.mockReturnValue({ role: "admin", enabled: true });
  expect(await administrator({})).toBe(true);
  expect(await systemAdministrator({})).toBe(false);
});

it("rejects disabled native administrators", async () => {
  vi.stubEnv("GATHER_AUTH_ENABLED", "true");
  vi.stubEnv("GATHER_EDITOR_ENABLED", "true");
  vi.stubEnv("GATHER_ADMIN_IDS", "bootstrap");
  getToken.mockResolvedValue({ sub: "member" });
  userAccess.mockReturnValueOnce({ role: "admin", enabled: false });
  expect(await administrator({})).toBe(false);
});
