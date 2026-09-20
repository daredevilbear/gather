import { getToken } from "next-auth/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { administrator, validEditorOrigin } from "./admin";
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("editor authorization", () => {
  it("denies anonymous users, viewers and unconfigured installations", async () => {
    vi.stubEnv("HOMEPAGE_AUTH_ENABLED", "true");
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
    vi.stubEnv("HOMEPAGE_AUTH_ENABLED", "false");
    expect(await administrator({})).toBe(false);
  });
  it("requires exact configured origin and custom request header", () => {
    vi.stubEnv("HOMEPAGE_EXTERNAL_URL", "https://dashboard.example.test");
    expect(validEditorOrigin({ headers: { origin: "https://dashboard.example.test", "x-gather-editor": "1" } })).toBe(
      true,
    );
    expect(validEditorOrigin({ headers: { origin: "https://evil.test", "x-gather-editor": "1" } })).toBe(false);
    expect(validEditorOrigin({ headers: { origin: "https://dashboard.example.test" } })).toBe(false);
  });
});
