import { describe,expect,it } from "vitest";
import { assertCanCreateStrategy,buildEntitlementSnapshot } from "../src/domain/entitlements";

describe("plan entitlements",()=>{
  const free=buildEntitlementSnapshot({slug:"free",maxActiveStrategies:1,entitlements:{features:["history"],notificationChannels:[]},availableStrategyKeys:[]});
  const investor=buildEntitlementSnapshot({slug:"investor",maxActiveStrategies:3,entitlements:{features:["analytics"],notificationChannels:["EMAIL","DISCORD"]},availableStrategyKeys:[]});
  it("enforces the free strategy limit server-side",()=>{expect(()=>assertCanCreateStrategy(free,1,"9sig")).toThrow("PLAN_STRATEGY_LIMIT");});
  it("allows an upgraded account to create more instances",()=>{expect(()=>assertCanCreateStrategy(investor,1,"9sig")).not.toThrow();});
  it("does not leak paid notification channels to free",()=>{expect(free.notificationChannels.has("DISCORD")).toBe(false);expect(investor.notificationChannels.has("DISCORD")).toBe(true);});
  it("accepts serialized JSONB entitlement payloads",()=>{
    const snapshot=buildEntitlementSnapshot({
      slug:"pro",
      maxActiveStrategies:null,
      entitlements:'{"features":["what_if","multi_account"],"notificationChannels":["EMAIL","DISCORD"]}',
      availableStrategyKeys:'["9sig","hfea"]'
    });
    expect(snapshot.features.has("multi_account")).toBe(true);
    expect(snapshot.features.has("what_if")).toBe(true);
    expect(snapshot.notificationChannels.has("DISCORD")).toBe(true);
    expect(snapshot.availableStrategyKeys?.has("hfea")).toBe(true);
  });
});
