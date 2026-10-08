import { requireAdmin } from "@/lib/session";
import { checkCommercialLaunch } from "@/domain/commercial-launch";
import { sql } from "@/lib/db";
export const dynamic="force-dynamic";
export async function GET(){
 await requireAdmin();
 const checks=checkCommercialLaunch(process.env);
 const [workers,deliveries,webhooks]=await Promise.all([
  sql.unsafe("SELECT DISTINCT ON (worker_key) worker_key,status,started_at,finished_at FROM worker_runs ORDER BY worker_key,started_at DESC LIMIT 30"),
  sql.unsafe("SELECT status,channel,count(*)::int AS count FROM notification_deliveries GROUP BY status,channel"),
  sql.unsafe("SELECT status,count(*)::int AS count FROM billing_webhook_events GROUP BY status")
 ]);
 return Response.json({
  configured:checks.map(x=>({key:x.key,ready:x.passed,reason:x.reason})),
  workers:workers.map(x=>({key:String(x.worker_key),status:String(x.status),startedAt:x.started_at,finishedAt:x.finished_at})),
  notificationDeliveries:deliveries.map(x=>({status:String(x.status),channel:String(x.channel),count:Number(x.count)})),
  stripeWebhookEvents:webhooks.map(x=>({status:String(x.status),count:Number(x.count)})),
  credentialsExposed:false
 },{headers:{"cache-control":"private, no-store"}});
}
