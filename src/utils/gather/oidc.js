export const GATHER_OIDC_PROVIDER = "gather-oidc";

export function oidcProviderId(env = process.env) {
  const id = env.GATHER_OIDC_PROVIDER_ID || GATHER_OIDC_PROVIDER;
  if (id !== GATHER_OIDC_PROVIDER) {
    throw new Error("GATHER_OIDC_PROVIDER_ID must be gather-oidc.");
  }
  return id;
}
