import { sql } from "@/lib/db";
import { calculateAction } from "@/lib/action-service";
import { createDeliveriesForNotification, processPendingDeliveries } from "@/lib/notification-service";
import { rebuildAnonymousAggregates } from "@/lib/aggregate-service";
import { refreshMarketData } from "@/lib/market-data-worker";
import { enforceStrategyEntitlements } from "@/lib/entitlement-service";
import { finishPendingAccountDeletions } from "@/lib/account-deletion";

function authorized(request: Request) {
  return Boolean(process.env.CRON_SECRET) && request.headers.get("authorization") === "Bearer " + process.env.CRON_SECRET;
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  // Finish account deletions that stalled (for example Stripe was unreachable when requested).
  const accountDeletions = await finishPendingAccountDeletions().catch(() => ({ completed: 0, stalled: -1 }));

  const marketData = await refreshMarketData();
  // Safety net: plan changes, missed webhooks or manual edits must never leave strategies
  // running beyond what the owner's plan allows. Pausing happens before calculation.
  const owners = await sql.unsafe("SELECT DISTINCT i.user_id FROM strategy_instances i JOIN users u ON u.id=i.user_id WHERE i.status='ACTIVE' AND u.deleted_at IS NULL");
  let entitlementPaused = 0;
  let entitlementFailures = 0;
  for (const owner of owners) {
    try {
      entitlementPaused += (await enforceStrategyEntitlements(String(owner.user_id))).paused;
    } catch {
      entitlementFailures += 1;
    }
  }

  const instances = await sql.unsafe("SELECT i.id FROM strategy_instances i JOIN users u ON u.id=i.user_id WHERE i.status='ACTIVE' AND u.deleted_at IS NULL ORDER BY i.id");
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
  const marketDataRequired=(process.env.MARKET_DATA_MODE??"PROVIDER").toUpperCase()!=="MANUAL";
  const marketDegraded=marketDataRequired&&(!marketData.configured||marketData.failed>0);
  const ok=calculationFailures===0&&entitlementFailures===0&&!marketDegraded&&accountDeletions.stalled===0;
  return Response.json(
    {ok,status:ok?"healthy":"degraded",accountDeletions,marketData,entitlementPaused,entitlementFailures,calculated,calculationFailures,delivered,aggregates},
    {status:ok?200:503,headers:{"cache-control":"no-store"}}
  );
}
