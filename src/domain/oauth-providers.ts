// Which "continue with" providers are switched on. A provider appears only when its credentials are
// configured, so a missing key can never produce a broken button.
type Environment = Record<string, string | undefined>;
export type OAuthProviderInfo = { id: "google" | "apple"; label: string };

const has = (value: string | undefined) => Boolean(value && value.trim());

export function appleConfigured(env: Environment) {
  return has(env.AUTH_APPLE_ID) && (has(env.AUTH_APPLE_SECRET) || (has(env.AUTH_APPLE_TEAM_ID) && has(env.AUTH_APPLE_KEY_ID) && has(env.AUTH_APPLE_PRIVATE_KEY)));
}

export function enabledOAuthProviders(env: Environment): OAuthProviderInfo[] {
  const providers: OAuthProviderInfo[] = [];
  if (has(env.AUTH_GOOGLE_ID) && has(env.AUTH_GOOGLE_SECRET)) providers.push({ id: "google", label: "Google" });
  if (appleConfigured(env)) providers.push({ id: "apple", label: "Apple" });
  return providers;
}

/** Providers differ in how they report a verified address; anything not clearly true counts as unverified. */
export function profileEmailVerified(provider: string, profile: Record<string, unknown> | undefined): boolean {
  const flag = profile?.email_verified;
  if (provider === "google") return flag === true || flag === "true";
  if (provider === "apple") return flag === true || flag === "true";
  return false;
}
