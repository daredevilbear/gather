import { afterEach, expect, it, vi } from "vitest";
import { isAuthEnabled } from "./env";

afterEach(() => vi.unstubAllEnvs());
it("requires Gather's explicit authentication setting", () => {
  vi.stubEnv("GATHER_AUTH_ENABLED", "true");
  expect(isAuthEnabled()).toBe(true);
  vi.stubEnv("GATHER_AUTH_ENABLED", "false");
  expect(isAuthEnabled()).toBe(false);
});
it("refuses unsupported enabled auth settings instead of starting anonymously", () => {
  vi.stubEnv("GATHER_AUTH_ENABLED", "false");
  vi.stubEnv("PREVIOUS_AUTH_ENABLED", "true");
  expect(() => isAuthEnabled()).toThrow("Unsupported authentication configuration");
});
