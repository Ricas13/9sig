import { sql } from "@/lib/db";
import { calculateAction } from "@/lib/action-service";
import { createDeliveriesForNotification, processPendingDeliveries } from "@/lib/notification-service";
import { rebuildAnonymousAggregates } from "@/lib/aggregate-service";
import { refreshMarketData } from "@/lib/market-data-worker";
import { enforceStrategyEntitlements } from "@/lib/entitlement-service";

function authorized(request: Request) {
  return Boolean(process.env.CRON_SECRET) && request.headers.get("authorization") === "Bearer " + process.env.CRON_SECRET;
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  const expiredGrace = await sql.unsafe(
    "SELECT user_id FROM subscriptions WHERE status='PAST_DUE' AND billing_grace_until IS NOT NULL AND billing_grace_until<=now()"
  );
  let delinquencyEnforcements = 0;
  for (const row of expiredGrace) {
    try {
      await enforceStrategyEntitlements(String(row.user_id));
      delinquencyEnforcements += 1;
    } catch {}
  }

  const marketData = await refreshMarketData();
  const instances = await sql.unsafe("SELECT id FROM strategy_instances WHERE status='ACTIVE' ORDER BY id");
  let calculated = 0;
  let calculationFailures = 0;
  for (const row of instances) {
    try {
      await calculateAction(String(row.id));
      calculated += 1;
    } catch {
      calculationFailures += 1;
    }
  }

  const notifications = await sql.unsafe(
    "SELECT n.id FROM notifications n LEFT JOIN notification_deliveries d ON d.notification_id=n.id WHERE d.id IS NULL ORDER BY n.created_at LIMIT 200"
  );
  for (const n of notifications) await createDeliveriesForNotification(String(n.id));

  const delivered = await processPendingDeliveries(100);
  const aggregates = await rebuildAnonymousAggregates();
  return Response.json({
    ok: true,
    delinquencyEnforcements,
    marketData,
    calculated,
    calculationFailures,
    delivered,
    aggregates
  });
}
