import "server-only";
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getEmailProvider } from "@/lib/email";
import { loadEntitlements } from "@/lib/entitlement-service";

export async function createDeliveriesForNotification(notificationId: string) {
  const rows = await sql.unsafe(
    "SELECT n.id,n.user_id,n.action_id,u.email FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.id=$1 LIMIT 1",
    [notificationId]
  );
  const n = rows[0];
  if (!n) return;
  const entitlements = await loadEntitlements(String(n.user_id));
  for (const channel of entitlements.notificationChannels) {
    if (channel === "IN_APP") continue;
    const dedupe = String(notificationId) + ":" + channel;
    await sql.unsafe(
      "INSERT INTO notification_deliveries (notification_id,channel,dedupe_key) VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING",
      [notificationId,channel,dedupe]
    );
  }
}

export async function processPendingDeliveries(limit = 50) {
  const deliveries = await sql.unsafe(
    "SELECT d.id,d.notification_id,d.channel,d.attempt_count,n.title,n.body,n.user_id,u.email FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN users u ON u.id=n.user_id WHERE d.status='PENDING' AND d.next_attempt_at<=now() ORDER BY d.created_at LIMIT $1",
    [limit]
  );
  let sent = 0;
  for (const d of deliveries) {
    let ok = false;
    try {
      if (d.channel === "EMAIL") {
        ok = await getEmailProvider().send({ to:String(d.email), subject:String(d.title), text:String(d.body) });
      } else if (d.channel === "DISCORD") {
        const endpoints = await sql.unsafe("SELECT encrypted_destination FROM notification_endpoints WHERE user_id=$1 AND channel='DISCORD' AND enabled=true LIMIT 1",[d.user_id]);
        if (endpoints[0]) {
          const response = await fetch(decryptSecret(String(endpoints[0].encrypted_destination)), {
            method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content:"**" + String(d.title) + "**\n" + String(d.body)})
          });
          ok = response.ok;
        }
      }
    } catch { ok = false; }

    if (ok) {
      await sql.unsafe("UPDATE notification_deliveries SET status='SENT',sent_at=now(),attempt_count=attempt_count+1,updated_at=now() WHERE id=$1",[d.id]);
      sent += 1;
    } else {
      await sql.unsafe("UPDATE notification_deliveries SET attempt_count=attempt_count+1,next_attempt_at=now()+interval '15 minutes',last_error_code='DELIVERY_FAILED',updated_at=now() WHERE id=$1",[d.id]);
    }
  }
  return sent;
}
