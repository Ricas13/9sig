export type PlanRecord = {
  slug: string;
  maxActiveStrategies: number | null;
  entitlements: unknown;
  availableStrategyKeys: unknown;
};

export type EntitlementSnapshot = {
  planSlug: string;
  maxActiveStrategies: number | null;
  features: Set<string>;
  notificationChannels: Set<string>;
  availableStrategyKeys: Set<string> | null;
};

function parseJsonish(value:unknown){
  if(typeof value!=="string")return value;
  try{return JSON.parse(value);}catch{return value;}
}

function strings(value: unknown) {
  const parsed=parseJsonish(value);
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
}

export function buildEntitlementSnapshot(plan: PlanRecord): EntitlementSnapshot {
  const parsedEntitlements=parseJsonish(plan.entitlements);
  const raw = (parsedEntitlements && typeof parsedEntitlements === "object" && !Array.isArray(parsedEntitlements) ? parsedEntitlements : {}) as Record<string, unknown>;
  const strategyKeys = strings(plan.availableStrategyKeys);
  return {
    planSlug: plan.slug,
    maxActiveStrategies: plan.maxActiveStrategies,
    features: new Set(strings(raw.features)),
    notificationChannels: new Set(["IN_APP", ...strings(raw.notificationChannels)]),
    availableStrategyKeys: strategyKeys.length ? new Set(strategyKeys) : null
  };
}

export function assertCanCreateStrategy(snapshot: EntitlementSnapshot, activeCount: number, strategyKey: string) {
  if (snapshot.maxActiveStrategies !== null && activeCount >= snapshot.maxActiveStrategies) throw new Error("PLAN_STRATEGY_LIMIT");
  if (snapshot.availableStrategyKeys && !snapshot.availableStrategyKeys.has(strategyKey)) throw new Error("STRATEGY_NOT_IN_PLAN");
}


export function assertStrategyFeatureAccess(snapshot:EntitlementSnapshot,input:{accountCount:number}){
  if(input.accountCount>1&&!snapshot.features.has("multi_account"))throw new Error("MULTI_ACCOUNT_NOT_IN_PLAN");
}
