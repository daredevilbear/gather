export const GATHER_OIDC_PROVIDER = "gather-oidc";
export const LEGACY_OIDC_PROVIDER = "homepage-oidc";

export function oidcProviderId(env = process.env) {
  // Existing deployments have no selection and an IdP registered to the old URL.
  // New installation templates explicitly select the Gather callback.
  const id = env.GATHER_OIDC_PROVIDER_ID || LEGACY_OIDC_PROVIDER;
  if (![GATHER_OIDC_PROVIDER, LEGACY_OIDC_PROVIDER].includes(id)) {
    throw new Error("GATHER_OIDC_PROVIDER_ID must be gather-oidc or homepage-oidc.");
  }
  return id;
}
