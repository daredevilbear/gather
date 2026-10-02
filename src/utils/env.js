export function isAuthEnabled() {
  // Refuse enabled authentication settings from an unsupported namespace.
  // Ignoring them could accidentally start an upgraded dashboard anonymously.
  if (
    Object.entries(process.env).some(
      ([name, value]) => name.endsWith("_AUTH_ENABLED") && name !== "GATHER_AUTH_ENABLED" && value === "true",
    )
  ) {
    throw new Error(
      "Unsupported authentication configuration. Migrate to GATHER_AUTH_ENABLED before starting Gather. See https://gather.daredevilbear.dev/gather/setup/.",
    );
  }
  return process.env.GATHER_AUTH_ENABLED === "true";
}

// Frozen at module load, so map them before anything imports it
export function applyNextAuthEnv() {
  if (!process.env.NEXTAUTH_SECRET && process.env.GATHER_AUTH_SECRET) {
    process.env.NEXTAUTH_SECRET = process.env.GATHER_AUTH_SECRET;
  }
  if (!process.env.NEXTAUTH_URL && process.env.GATHER_EXTERNAL_URL) {
    process.env.NEXTAUTH_URL = process.env.GATHER_EXTERNAL_URL;
  }
}
