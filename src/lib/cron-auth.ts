import "server-only";
import crypto from "node:crypto";

/** Bearer-token check for scheduler/monitor endpoints, in constant time. False when no secret is set. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update("Bearer " + secret).digest();
  return crypto.timingSafeEqual(a, b);
}
