import "server-only";
import { sql } from "@/lib/db";
import { assertCanCreateStrategy, buildEntitlementSnapshot, type EntitlementSnapshot } from "@/domain/entitlements";

export async function loadEntitlements(userId: string) {
  let rows = await sql.unsafe(
    "SELECT p.slug,p.max_active_strategies,p.entitlements,p.available_strategy_keys FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND (s.status IN ('FREE','ACTIVE','TRIALING') OR (s.status='PAST_DUE' AND s.billing_grace_until>now())) LIMIT 1",
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
  const countRows = await sql.unsafe(
    "SELECT count(*)::int AS count FROM strategy_instances WHERE user_id=$1 AND status='ACTIVE'",
    [userId]
  );
  assertCanCreateStrategy(snapshot, Number(countRows[0]?.count ?? 0), strategyKey);
  return snapshot;
}

export async function assertNotificationAllowed(userId: string, channel: string) {
  const snapshot = await loadEntitlements(userId);
  if (!snapshot.notificationChannels.has(channel)) throw new Error("CHANNEL_NOT_IN_PLAN");
}

export async function enforceStrategyEntitlements(userId: string, snapshot?: EntitlementSnapshot) {
  const entitlements = snapshot ?? await loadEntitlements(userId);
  const active = await sql.unsafe(
    "SELECT i.id,d.key FROM strategy_instances i JOIN strategy_definitions d ON d.id=i.strategy_definition_id WHERE i.user_id=$1 AND i.status='ACTIVE' ORDER BY i.started_at ASC,i.created_at ASC",
    [userId]
  );

  const permitted = active.filter((row) => !entitlements.availableStrategyKeys || entitlements.availableStrategyKeys.has(String(row.key)));
  const disallowed = active.filter((row) => entitlements.availableStrategyKeys && !entitlements.availableStrategyKeys.has(String(row.key)));
  const max = entitlements.maxActiveStrategies;
  const overLimit = max == null ? [] : permitted.slice(max);
  const toPause = [...disallowed, ...overLimit];
  if (!toPause.length) return { paused: 0 };

  const ids = toPause.map((row) => String(row.id));
  await sql.begin(async (tx) => {
    await tx.unsafe(
      "UPDATE strategy_instances SET status='PAUSED',paused_at=now(),updated_at=now() WHERE user_id=$1 AND id=ANY($2::uuid[]) AND status='ACTIVE'",
      [userId, ids]
    );
    await tx.unsafe(
      "UPDATE actions SET status='CANCELLED',cancelled_at=now(),updated_at=now() WHERE strategy_instance_id=ANY($1::uuid[]) AND status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED')",
      [ids]
    );
    await tx.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,metadata) VALUES ($1,'entitlements.enforced','subscription',$2::jsonb)",
      [userId, JSON.stringify({ plan: entitlements.planSlug, pausedStrategyInstanceIds: ids })]
    );
  });
  return { paused: ids.length };
}
