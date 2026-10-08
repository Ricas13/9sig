// Where to send a user after sign-in. Only paths inside the signed-in areas are honoured, so the
// login page cannot be used as an open redirect (//evil.test, /\evil.test, https://…, javascript:…).
export function safeNextPath(raw: unknown, fallback = "/app"): string {
  if (typeof raw !== "string" || raw.length > 500) return fallback;
  if (!/^\/(app|admin)(\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*)?(\?[A-Za-z0-9._~!$&'()*+,;=:@%\/?-]*)?$/.test(raw)) return fallback;
  if (raw.includes("//") || raw.includes("..")) return fallback;
  return raw;
}
