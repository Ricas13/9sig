import "server-only";
import Decimal from "decimal.js";
import { sql } from "@/lib/db";
import { assertCanCreateStrategy, buildEntitlementSnapshot } from "@/domain/entitlements";
import { parseInputSchema, validateInstanceSettings } from "@/domain/strategy/config";
import { serializeExecutionConstraints } from "@/domain/execution";
import { normalizeContributionPlan } from "@/domain/contribution-plan";

export type CreateStrategyInput = {
  strategyKey: string;
  name: string;
  wrapper: string;
  broker?: string | null;
  currency: string;
  onboardingMode: "START_NEW" | "RESUME";
  startingCash?: string;
  approximateValue?: string;
  settings?: Record<string, unknown>;
  executionConstraints?: Record<string, unknown>;
  contributionPlan?: Record<string, unknown>;
};

export async function listAvailableStrategies() {
  return sql.unsafe(
    "SELECT d.id,d.key,d.name,d.family,d.description,d.engine,d.proprietary,d.supported_regions,d.supported_wrappers,"+
    "v.id AS version_id,v.version,v.config,v.input_schema,v.release_notes,v.engine_key "+
    "FROM strategy_definitions d JOIN LATERAL ("+
    " SELECT * FROM strategy_versions v WHERE v.strategy_definition_id=d.id AND v.lifecycle_status='PUBLISHED'"+
    " AND v.effective_from<=current_date AND (v.effective_to IS NULL OR v.effective_to>=current_date)"+
    " ORDER BY v.effective_from DESC,v.published_at DESC NULLS LAST LIMIT 1"+
    ") v ON true WHERE d.enabled=true ORDER BY d.name"
  );
}

export async function listUserStrategies(userId: string) {
  return sql.unsafe(
    "SELECT i.id,i.name,i.status,i.health_status,i.started_at,i.last_reconciled_at,d.key AS strategy_key,d.name AS strategy_name,d.family,a.wrapper,a.currency,a.broker_name,v.version "+
    "FROM strategy_instances i JOIN strategy_definitions d ON d.id=i.strategy_definition_id JOIN strategy_versions v ON v.id=i.strategy_version_id "+
    "LEFT JOIN accounts a ON a.id=i.account_id WHERE i.user_id=$1 ORDER BY i.created_at DESC",
    [userId]
  );
}

export async function getStrategyForUser(userId: string, instanceId: string) {
  const rows = await sql.unsafe(
    "SELECT i.*,d.key AS strategy_key,d.name AS strategy_name,d.family,d.description,"+
    "v.version,v.engine_key AS engine,v.config,v.disclosure,v.release_notes,v.input_schema,v.upgrade_policy,"+
    "a.wrapper,a.currency,a.country,a.broker_name,s.state,s.confidence AS state_confidence,"+
    "latest.id AS latest_version_id,latest.version AS latest_version,latest.release_notes AS latest_release_notes,"+
    "latest.upgrade_policy AS latest_upgrade_policy,latest.input_schema AS latest_input_schema "+
    "FROM strategy_instances i JOIN strategy_definitions d ON d.id=i.strategy_definition_id "+
    "JOIN strategy_versions v ON v.id=i.strategy_version_id LEFT JOIN accounts a ON a.id=i.account_id "+
    "JOIN strategy_states s ON s.strategy_instance_id=i.id "+
    "LEFT JOIN LATERAL ("+
    " SELECT nv.id,nv.version,nv.release_notes,nv.upgrade_policy,nv.input_schema FROM strategy_versions nv"+
    " WHERE nv.strategy_definition_id=i.strategy_definition_id AND nv.lifecycle_status='PUBLISHED'"+
    " AND nv.effective_from<=current_date AND (nv.effective_to IS NULL OR nv.effective_to>=current_date)"+
    " ORDER BY nv.effective_from DESC,nv.published_at DESC NULLS LAST LIMIT 1"+
    ") latest ON true WHERE i.id=$1 AND i.user_id=$2 LIMIT 1",
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
      "SELECT d.id,d.key,d.name,d.supported_regions,d.supported_wrappers,d.required_inputs,"+
      "v.id AS version_id,v.engine_key,v.config,v.input_schema FROM strategy_definitions d JOIN LATERAL ("+
      " SELECT * FROM strategy_versions v WHERE v.strategy_definition_id=d.id AND v.lifecycle_status='PUBLISHED'"+
      " AND v.effective_from<=current_date AND (v.effective_to IS NULL OR v.effective_to>=current_date)"+
      " ORDER BY v.effective_from DESC,v.published_at DESC NULLS LAST LIMIT 1"+
      ") v ON true WHERE d.key=$1 AND d.enabled=true LIMIT 1",
      [input.strategyKey]
    );
    const definition = definitions[0];
    if (!definition) throw new Error("STRATEGY_NOT_AVAILABLE");

    const regions=Array.isArray(definition.supported_regions)?definition.supported_regions.map(String):[];
    const wrappers=Array.isArray(definition.supported_wrappers)?definition.supported_wrappers.map(String):[];
    if(regions.length&&!regions.includes(country))throw new Error("STRATEGY_NOT_SUPPORTED_IN_REGION");
    if(wrappers.length&&!wrappers.includes(input.wrapper))throw new Error("STRATEGY_NOT_SUPPORTED_FOR_WRAPPER");

    const inputSchema=parseInputSchema(
      Array.isArray(definition.input_schema)&&definition.input_schema.length?definition.input_schema:definition.required_inputs
    );
    const settings=validateInstanceSettings(inputSchema,input.settings);
    const executionConstraints=serializeExecutionConstraints(input.executionConstraints);
    const contributionPlan=normalizeContributionPlan(input.contributionPlan);

    const accounts = await tx.unsafe(
      "INSERT INTO accounts (user_id,name,wrapper,country,currency,broker_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [userId,input.name + " account",input.wrapper,country,input.currency,input.broker ?? null]
    );
    const state = input.onboardingMode === "RESUME"
      ? { resumeNeedsReconciliation:true, approximateValue:input.approximateValue ?? null, forceReview:false }
      : { forceReview:true };
    const instances = await tx.unsafe(
      "INSERT INTO strategy_instances (user_id,account_id,strategy_definition_id,strategy_version_id,name,onboarding_mode,health_status,settings,execution_constraints,contribution_plan) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb) RETURNING id",
      [userId,accounts[0].id,definition.id,definition.version_id,input.name,input.onboardingMode,input.onboardingMode==="RESUME"?"NEEDS_ATTENTION":"HEALTHY",JSON.stringify(settings),JSON.stringify(executionConstraints),JSON.stringify(contributionPlan)]
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
      [userId,id,JSON.stringify({strategyKey:input.strategyKey,onboardingMode:input.onboardingMode,plan:snapshot.planSlug,versionId:String(definition.version_id)})]
    );
    return id;
  });
}

export async function migrateStrategyVersion(
  userId:string,
  instanceId:string,
  targetVersionId:string,
  suppliedSettings?:Record<string,unknown>
){
  return sql.begin(async(tx)=>{
    const userRows=await tx.unsafe("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[userId]);
    if(!userRows[0])throw new Error("UNAUTHENTICATED");
    const rows=await tx.unsafe(
      "SELECT i.id,i.status,i.strategy_definition_id,i.strategy_version_id,i.settings,s.state,cv.engine_key AS current_engine "+
      "FROM strategy_instances i JOIN strategy_states s ON s.strategy_instance_id=i.id JOIN strategy_versions cv ON cv.id=i.strategy_version_id "+
      "WHERE i.id=$1 AND i.user_id=$2 FOR UPDATE OF i,s",
      [instanceId,userId]
    );
    const instance=rows[0];
    if(!instance)throw new Error("STRATEGY_INSTANCE_NOT_FOUND");
    if(String(instance.status)==="CLOSED")throw new Error("STRATEGY_ALREADY_CLOSED");
    if(String(instance.strategy_version_id)===targetVersionId)return {changed:false};

    const targets=await tx.unsafe(
      "SELECT id,strategy_definition_id,engine_key,input_schema,version FROM strategy_versions WHERE id=$1 AND lifecycle_status='PUBLISHED'"+
      " AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date) LIMIT 1",
      [targetVersionId]
    );
    const target=targets[0];
    if(!target||String(target.strategy_definition_id)!==String(instance.strategy_definition_id))throw new Error("INVALID_TARGET_VERSION");
    if(String(target.engine_key)!==String(instance.current_engine))throw new Error("ENGINE_MIGRATION_NOT_SUPPORTED");

    const merged={...((instance.settings??{}) as Record<string,unknown>),...(suppliedSettings??{})};
    const settings=validateInstanceSettings(parseInputSchema(target.input_schema),merged);
    const before=(instance.state??{}) as Record<string,unknown>;
    const after={...before,forceReview:true,versionMigratedAt:new Date().toISOString()};

    await tx.unsafe(
      "UPDATE actions SET status='SUPERSEDED',cancelled_at=COALESCE(cancelled_at,now()),updated_at=now() WHERE strategy_instance_id=$1 AND status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED')",
      [instanceId]
    );
    await tx.unsafe("UPDATE strategy_instances SET strategy_version_id=$1,settings=$2::jsonb,health_status='NEEDS_ATTENTION',updated_at=now() WHERE id=$3",[targetVersionId,JSON.stringify(settings),instanceId]);
    await tx.unsafe("UPDATE strategy_states SET strategy_version_id=$1,state=$2::jsonb,confidence='MEDIUM',calculated_at=now() WHERE strategy_instance_id=$3",[targetVersionId,JSON.stringify(after),instanceId]);
    await tx.unsafe(
      "INSERT INTO strategy_version_migrations (strategy_instance_id,from_version_id,to_version_id,state_before,state_after,migrated_by) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,'USER')",
      [instanceId,instance.strategy_version_id,targetVersionId,JSON.stringify(before),JSON.stringify(after)]
    );
    await tx.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'strategy.version-migrated','strategy_instance',$2,$3::jsonb)",
      [userId,instanceId,JSON.stringify({fromVersionId:String(instance.strategy_version_id),toVersionId:targetVersionId,toVersion:String(target.version)})]
    );
    return {changed:true};
  });
}

export async function changeStrategyStatus(
  userId: string,
  instanceId: string,
  target: "ACTIVE" | "PAUSED" | "CLOSED"
) {
  return sql.begin(async (tx) => {
    const userRows = await tx.unsafe("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [userId]);
    if (!userRows[0]) throw new Error("UNAUTHENTICATED");
    const rows = await tx.unsafe(
      "SELECT i.id,i.status,d.key AS strategy_key FROM strategy_instances i JOIN strategy_definitions d ON d.id=i.strategy_definition_id WHERE i.id=$1 AND i.user_id=$2 FOR UPDATE OF i",
      [instanceId, userId]
    );
    const instance = rows[0];
    if (!instance) throw new Error("STRATEGY_INSTANCE_NOT_FOUND");
    const current = String(instance.status);
    if (current === "CLOSED") throw new Error("STRATEGY_ALREADY_CLOSED");
    if (target === current) return { status: current };

    if (target === "ACTIVE") {
      let planRows = await tx.unsafe(
        "SELECT p.slug,p.max_active_strategies,p.entitlements,p.available_strategy_keys FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.status IN ('FREE','ACTIVE','TRIALING','PAST_DUE') LIMIT 1",
        [userId]
      );
      if (!planRows[0]) planRows=await tx.unsafe("SELECT slug,max_active_strategies,entitlements,available_strategy_keys FROM plans WHERE slug='free' LIMIT 1");
      if (!planRows[0]) throw new Error("FREE_PLAN_MISSING");
      const snapshot = buildEntitlementSnapshot({
        slug:String(planRows[0].slug),
        maxActiveStrategies:planRows[0].max_active_strategies==null?null:Number(planRows[0].max_active_strategies),
        entitlements:planRows[0].entitlements,
        availableStrategyKeys:planRows[0].available_strategy_keys
      });
      const countRows=await tx.unsafe("SELECT count(*)::int AS count FROM strategy_instances WHERE user_id=$1 AND status='ACTIVE' AND id<>$2",[userId,instanceId]);
      assertCanCreateStrategy(snapshot,Number(countRows[0]?.count??0),String(instance.strategy_key));
      await tx.unsafe("UPDATE strategy_instances SET status='ACTIVE',paused_at=NULL,health_status='NEEDS_ATTENTION',updated_at=now() WHERE id=$1",[instanceId]);
      await tx.unsafe("UPDATE strategy_states SET state=jsonb_set(state,'{forceReview}','true'::jsonb,true),calculated_at=now() WHERE strategy_instance_id=$1",[instanceId]);
    } else if (target === "PAUSED") {
      await tx.unsafe("UPDATE strategy_instances SET status='PAUSED',paused_at=now(),updated_at=now() WHERE id=$1",[instanceId]);
      await tx.unsafe("UPDATE actions SET status='CANCELLED',cancelled_at=now(),updated_at=now() WHERE strategy_instance_id=$1 AND status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED')",[instanceId]);
    } else {
      await tx.unsafe("UPDATE strategy_instances SET status='CLOSED',closed_at=now(),paused_at=NULL,updated_at=now() WHERE id=$1",[instanceId]);
      await tx.unsafe("UPDATE actions SET status='CANCELLED',cancelled_at=now(),updated_at=now() WHERE strategy_instance_id=$1 AND status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED')",[instanceId]);
    }
    await tx.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'strategy.status-changed','strategy_instance',$2,$3::jsonb)",
      [userId,instanceId,JSON.stringify({from:current,to:target})]
    );
    return {status:target};
  });
}
