// Maps the errors thrown by requireUser/requireAdmin to proper HTTP answers. Route handlers call
// this first in their catch block so a missing, revoked or insufficient session is reported as
// 401/403 instead of being swallowed into a generic 4xx/5xx "could not ..." message.
export function authFailure(error: unknown): Response | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTHENTICATED") {
    return Response.json({ error: "Sign in again to continue." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  if (code === "FORBIDDEN") {
    return Response.json({ error: "You do not have access to this." }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  return null;
}
