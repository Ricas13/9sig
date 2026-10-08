import "server-only";
import { sql } from "@/lib/db";
import { summarizeUserAgent } from "@/domain/device";
import { notifySecurityEvent } from "@/lib/security-notice";

const MAX_DEVICES = 25;

/**
 * Remembers the device and tells the owner when it is new. The very first sign-in never alerts
 * (everything is new then); after that, a sign-in from an unseen browser/OS does. Best effort: a
 * failure here must never block signing in.
 */
export async function recordSignIn(userId: string, userAgent: string | null | undefined): Promise<"first" | "known" | "new" | "error"> {
  try {
    const device = summarizeUserAgent(userAgent);
    const outcome = await sql.begin(async (tx) => {
      await tx.unsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,4))", [userId]);
      const known = await tx.unsafe("SELECT 1 FROM sign_in_devices WHERE user_id=$1 AND device_key=$2", [userId, device.key]);
      if (known[0]) {
        await tx.unsafe("UPDATE sign_in_devices SET last_seen_at=now() WHERE user_id=$1 AND device_key=$2", [userId, device.key]);
        return "known" as const;
      }
      const existing = await tx.unsafe("SELECT count(*)::int AS n FROM sign_in_devices WHERE user_id=$1", [userId]);
      await tx.unsafe("INSERT INTO sign_in_devices (user_id,device_key,label) VALUES ($1,$2,$3)", [userId, device.key, device.label]);
      await tx.unsafe(
        "DELETE FROM sign_in_devices WHERE user_id=$1 AND device_key IN (SELECT device_key FROM sign_in_devices WHERE user_id=$1 ORDER BY last_seen_at DESC OFFSET $2)",
        [userId, MAX_DEVICES]
      );
      return Number(existing[0].n) === 0 ? ("first" as const) : ("new" as const);
    });
    if (outcome === "new") await notifySecurityEvent(userId, "NEW_DEVICE_SIGN_IN", device.label);
    return outcome;
  } catch {
    return "error";
  }
}
