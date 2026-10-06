import "server-only";
import { sql } from "@/lib/db";
import { assertCanCreateStrategy, buildEntitlementSnapshot } from "@/domain/entitlements";

export async function loadEntitlements(userId: string) {
  let rows = await sql.unsafe(
    "SELECT p.slug,p.max_active_strategies,p.entitlements,p.available_strategy_keys FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.status IN ('FREE','ACTIVE','TRIALING') LIMIT 1",
    [userId]
  );
  if (!rows[0]) rows = await sql.unsafe("SELECT slug,max_active_strategies,entitlements,available_strategy_keys FROM plans WHERE slug='free' LIMIT 1");
  if (!rows[0]) throw new Error("FREE_PLAN_MISSING");
  return buildEntitlementSnapshot({
    slug: String(rows[0].slug),
    maxActiveStrategies: rows[0].max_active_strategies == null ? null : Number(rows[0].max_active_strategies),
    entitlements: rows[0].entitlements,
    availableStrategyKeys: rows[0].available_strategy_keys
  });
}

export async function assertStrategyCreationAllowed(userId: string, strategyKey: string) {
  const snapshot = await loadEntitlements(userId);
  const countRows = await sql.unsafe("SELECT count(*)::int AS count FROM strategy_instances WHERE user_id=$1 AND status='ACTIVE'", [userId]);
  assertCanCreateStrategy(snapshot, Number(countRows[0]?.count ?? 0), strategyKey);
  return snapshot;
}

export async function assertNotificationAllowed(userId: string, channel: string) {
  const snapshot = await loadEntitlements(userId);
  if (!snapshot.notificationChannels.has(channel)) throw new Error("CHANNEL_NOT_IN_PLAN");
}
