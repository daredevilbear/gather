import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MAX_PASSWORD_LENGTH = 1024;
const MAX_CONCURRENT_CHECKS = 2;

export default function createSharedPasswordVerifier(password) {
  if (typeof password !== "string" || !password || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("GATHER_AUTH_PASSWORD must contain 1–1024 characters.");
  }
  const salt = randomBytes(32);
  // Derive once during provider initialization; request checks run off the event loop.
  const expected = scryptSync(password, salt, 64, OPTIONS);
  let activeChecks = 0;
  return async (provided) => {
    if (
      typeof provided !== "string" ||
      !provided ||
      provided.length > MAX_PASSWORD_LENGTH ||
      activeChecks >= MAX_CONCURRENT_CHECKS
    ) {
      return false;
    }
    activeChecks += 1;
    try {
      const actual = await derive(provided, salt, expected.length, OPTIONS);
      return timingSafeEqual(actual, expected);
    } finally {
      activeChecks -= 1;
    }
  };
}
