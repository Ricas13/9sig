import { describe,expect,it } from "vitest";
import { assertStrategyFeatureAccess, buildEntitlementSnapshot } from "../src/domain/entitlements";

describe("downgrade entitlement shape",()=>{
  it("represents free as a single-active-instance entitlement",()=>{
    const free=buildEntitlementSnapshot({slug:"free",maxActiveStrategies:1,entitlements:{notificationChannels:[]},availableStrategyKeys:[]});
    expect(free.maxActiveStrategies).toBe(1);
    expect(free.notificationChannels.has("EMAIL")).toBe(false);
  });

  it("blocks multi-account activation when the plan does not include it",()=>{
    const investor=buildEntitlementSnapshot({
      slug:"investor",
      maxActiveStrategies:3,
      entitlements:{features:["history"]},
      availableStrategyKeys:[]
    });
    expect(()=>assertStrategyFeatureAccess(investor,{accountCount:2})).toThrow("MULTI_ACCOUNT_NOT_IN_PLAN");
    expect(()=>assertStrategyFeatureAccess(investor,{accountCount:1})).not.toThrow();
  });

  it("allows multi-account activation when explicitly entitled",()=>{
    const pro=buildEntitlementSnapshot({
      slug:"pro",
      maxActiveStrategies:null,
      entitlements:{features:["history","multi_account"]},
      availableStrategyKeys:[]
    });
    expect(()=>assertStrategyFeatureAccess(pro,{accountCount:3})).not.toThrow();
  });
});
