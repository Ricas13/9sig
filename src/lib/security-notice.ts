import "server-only";
import { sql } from "@/lib/db";
import { getEmailProvider } from "@/lib/email";
import { buildSecurityNotice, type SecurityNoticeKind } from "@/domain/security-notice";

/** Best effort: a mail outage must never block or undo the security change itself. */
export async function notifySecurityEvent(userId: string, kind: SecurityNoticeKind, detail?: string) {
  try {
    const rows = await sql.unsafe("SELECT email FROM users WHERE id=$1 AND deleted_at IS NULL", [userId]);
    if (!rows[0]) return false;
    const brand = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Rebalune";
    const message = buildSecurityNotice(kind, brand, detail);
    const sent = await getEmailProvider().send({ to: String(rows[0].email), ...message });
    await sql.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,'security.notice',$2,$1::text,$3::jsonb)",
      [userId, "user", JSON.stringify({ kind, sent })]
    );
    return sent;
  } catch {
    return false;
  }
}
