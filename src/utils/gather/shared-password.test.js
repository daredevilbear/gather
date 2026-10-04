import { describe, expect, it } from "vitest";

import createSharedPasswordVerifier from "./shared-password";

describe("shared-password verification", () => {
  it("accepts only the exact configured password, including Unicode and whitespace", async () => {
    const verify = createSharedPasswordVerifier(" é🔐 password ");
    expect(await verify(" é🔐 password ")).toBe(true);
    for (const value of ["é🔐 password", " e🔐 password ", "wrong", null, 123, "", "x".repeat(1025)]) {
      expect(await verify(value)).toBe(false);
    }
    expect(await verify(" é🔐 password ")).toBe(true);
  });

  it("bounds concurrent hashing work and releases capacity afterward", async () => {
    const verify = createSharedPasswordVerifier("test-password");
    const first = verify("test-password");
    const second = verify("wrong");
    expect(await verify("test-password")).toBe(false);
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(await verify("test-password")).toBe(true);
  });

  it("accepts the maximum length and rejects oversized configuration", async () => {
    const password = "x".repeat(1024);
    expect(await createSharedPasswordVerifier(password)(password)).toBe(true);
    for (const value of [undefined, "", "x".repeat(1025)]) {
      expect(() => createSharedPasswordVerifier(value)).toThrow("GATHER_AUTH_PASSWORD");
    }
  });
});
