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

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

export function buildEntitlementSnapshot(plan: PlanRecord): EntitlementSnapshot {
  const raw = (plan.entitlements && typeof plan.entitlements === "object" ? plan.entitlements : {}) as Record<string, unknown>;
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
