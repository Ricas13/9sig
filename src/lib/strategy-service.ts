import "server-only";
import Decimal from "decimal.js";
import { sql } from "@/lib/db";
import { assertCanCreateStrategy, buildEntitlementSnapshot } from "@/domain/entitlements";

export type CreateStrategyInput = {
  strategyKey: string;
  name: string;
  wrapper: string;
  broker?: string | null;
  currency: string;
  onboardingMode: "START_NEW" | "RESUME";
  startingCash?: string;
  approximateValue?: string;
};

export async function listAvailableStrategies() {
  return sql.unsafe(
    "SELECT d.id,d.key,d.name,d.family,d.description,d.engine,d.proprietary,d.supported_regions,d.supported_wrappers,v.id AS version_id,v.version,v.config FROM strategy_definitions d JOIN LATERAL (SELECT * FROM strategy_versions v WHERE v.strategy_definition_id=d.id AND v.effective_from<=current_date AND (v.effective_to IS NULL OR v.effective_to>=current_date) ORDER BY v.effective_from DESC LIMIT 1) v ON true WHERE d.enabled=true ORDER BY d.name"
  );
}

export async function listUserStrategies(userId: string) {
  return sql.unsafe(
    "SELECT i.id,i.name,i.status,i.health_status,i.started_at,i.last_reconciled_at,d.key AS strategy_key,d.name AS strategy_name,d.family,a.wrapper,a.currency,a.broker_name,v.version FROM strategy_instances i JOIN strategy_definitions d ON d.id=i.strategy_definition_id JOIN strategy_versions v ON v.id=i.strategy_version_id LEFT JOIN accounts a ON a.id=i.account_id WHERE i.user_id=$1 ORDER BY i.created_at DESC",
    [userId]
  );
}

export async function getStrategyForUser(userId: string, instanceId: string) {
  const rows = await sql.unsafe(
    "SELECT i.*,d.key AS strategy_key,d.name AS strategy_name,d.family,d.engine,d.description,v.version,v.config,v.disclosure,a.wrapper,a.currency,a.country,a.broker_name FROM strategy_instances i JOIN strategy_definitions d ON d.id=i.strategy_definition_id JOIN strategy_versions v ON v.id=i.strategy_version_id LEFT JOIN accounts a ON a.id=i.account_id WHERE i.id=$1 AND i.user_id=$2 LIMIT 1",
    [instanceId,userId]
  );
  return rows[0] ?? null;
}

export async function createStrategy(userId: string, country: string, input: CreateStrategyInput) {
  return sql.begin(async (tx) => {
    const locked = await tx.unsafe("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[userId]);
    if (!locked[0]) throw new Error("UNAUTHENTICATED");

    let planRows = await tx.unsafe(
      "SELECT p.slug,p.max_active_strategies,p.entitlements,p.available_strategy_keys FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.status IN ('FREE','ACTIVE','TRIALING','PAST_DUE') LIMIT 1",
      [userId]
    );
    if (!planRows[0]) planRows = await tx.unsafe("SELECT slug,max_active_strategies,entitlements,available_strategy_keys FROM plans WHERE slug='free' LIMIT 1");
    if (!planRows[0]) throw new Error("FREE_PLAN_MISSING");
    const snapshot = buildEntitlementSnapshot({
      slug:String(planRows[0].slug),
      maxActiveStrategies:planRows[0].max_active_strategies==null?null:Number(planRows[0].max_active_strategies),
      entitlements:planRows[0].entitlements,
      availableStrategyKeys:planRows[0].available_strategy_keys
    });
    const countRows = await tx.unsafe("SELECT count(*)::int AS count FROM strategy_instances WHERE user_id=$1 AND status='ACTIVE'",[userId]);
    assertCanCreateStrategy(snapshot,Number(countRows[0]?.count??0),input.strategyKey);

    const definitions = await tx.unsafe(
      "SELECT d.id,d.key,d.name,d.engine,v.id AS version_id,v.config FROM strategy_definitions d JOIN LATERAL (SELECT * FROM strategy_versions v WHERE v.strategy_definition_id=d.id AND v.effective_from<=current_date AND (v.effective_to IS NULL OR v.effective_to>=current_date) ORDER BY v.effective_from DESC LIMIT 1) v ON true WHERE d.key=$1 AND d.enabled=true LIMIT 1",
      [input.strategyKey]
    );
    const definition = definitions[0];
    if (!definition) throw new Error("STRATEGY_NOT_AVAILABLE");

    const accounts = await tx.unsafe(
      "INSERT INTO accounts (user_id,name,wrapper,country,currency,broker_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [userId,input.name + " account",input.wrapper,country,input.currency,input.broker ?? null]
    );
    const state = input.onboardingMode === "RESUME"
      ? { resumeNeedsReconciliation:true, approximateValue:input.approximateValue ?? null, forceReview:false }
      : { forceReview:true };
    const instances = await tx.unsafe(
      "INSERT INTO strategy_instances (user_id,account_id,strategy_definition_id,strategy_version_id,name,onboarding_mode,health_status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [userId,accounts[0].id,definition.id,definition.version_id,input.name,input.onboardingMode,input.onboardingMode==="RESUME"?"NEEDS_ATTENTION":"HEALTHY"]
    );
    const id=String(instances[0].id);
    await tx.unsafe(
      "INSERT INTO strategy_states (strategy_instance_id,strategy_version_id,state,confidence) VALUES ($1,$2,$3::jsonb,$4)",
      [id,definition.version_id,JSON.stringify(state),input.onboardingMode==="RESUME"?"LOW":"HIGH"]
    );

    const startingCash = new Decimal(input.startingCash ?? "0");
    if (!startingCash.isFinite() || startingCash.lt(0)) throw new Error("INVALID_STARTING_CASH");
    if (startingCash.gt(0)) {
      await tx.unsafe(
        "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,provenance,confidence,metadata) VALUES ($1,now(),'CONTRIBUTION',$2,$3,'USER_ENTERED','VERIFIED',$4::jsonb)",
        [id,input.currency,startingCash.toString(),JSON.stringify({opening:true})]
      );
    }
    await tx.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'strategy.created','strategy_instance',$2,$3::jsonb)",
      [userId,id,JSON.stringify({strategyKey:input.strategyKey,onboardingMode:input.onboardingMode,plan:snapshot.planSlug})]
    );
    return id;
  });
}
