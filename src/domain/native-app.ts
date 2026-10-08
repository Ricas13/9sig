// The Android/iOS apps are a thin native shell around this website. The shell adds a marker to the
// user agent (see mobile/capacitor.config.ts) so the server can adapt the few things app stores
// care about without a separate code path for every page.
export const NATIVE_APP_MARKER = "RebaluneApp";

export function isNativeApp(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && userAgent.includes(NATIVE_APP_MARKER));
}

/**
 * Subscriptions are bought on the website, not inside the apps: Apple and Google require their own
 * in-app purchase systems for digital subscriptions sold inside an app, and a link out to an external
 * checkout is not allowed in the same way. Inside the shell we therefore show the plan but not the
 * purchase buttons.
 */
export function purchasesAllowedFor(userAgent: string | null | undefined): boolean {
  return !isNativeApp(userAgent);
}

/** Google blocks OAuth inside embedded web views ("disallowed_useragent"), so its button is hidden there. */
export function providersForClient(providers: Array<{ id: string; label: string }>, userAgent: string | null | undefined) {
  return isNativeApp(userAgent) ? providers.filter((p) => p.id !== "google") : providers;
}
