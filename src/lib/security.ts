import "server-only";
import crypto from "node:crypto";
import { sql } from "@/lib/db";

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export function assertSameOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_URL_NOT_CONFIGURED");
    return;
  }
  const expected = new URL(configured).origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let actual: string | null = null;
  try {
    actual = origin ? new URL(origin).origin : referer ? new URL(referer).origin : null;
  } catch {
    throw new Error("INVALID_ORIGIN");
  }
  if (!actual || actual !== expected) throw new Error("INVALID_ORIGIN");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function consumeRateLimit(key: string, limit: number, windowSeconds: number) {
  const query = "INSERT INTO rate_limits (key,count,window_start,updated_at) VALUES ($1,1,now(),now()) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN rate_limits.window_start < now() - ($2::text || ' seconds')::interval THEN 1 ELSE rate_limits.count + 1 END, window_start = CASE WHEN rate_limits.window_start < now() - ($2::text || ' seconds')::interval THEN now() ELSE rate_limits.window_start END, updated_at = now() RETURNING count";
  const rows = await sql.unsafe(query, [key, String(windowSeconds)]);
  if (Number(rows[0]?.count ?? 0) > limit) throw new Error("RATE_LIMITED");
}
