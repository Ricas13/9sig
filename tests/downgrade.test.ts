import { describe,expect,it } from "vitest";
import { buildEntitlementSnapshot } from "../src/domain/entitlements";

describe("downgrade entitlement shape",()=>{
  it("represents free as a single-active-instance entitlement",()=>{
    const free=buildEntitlementSnapshot({slug:"free",maxActiveStrategies:1,entitlements:{notificationChannels:[]},availableStrategyKeys:[]});
    expect(free.maxActiveStrategies).toBe(1);
    expect(free.notificationChannels.has("EMAIL")).toBe(false);
  });
});
