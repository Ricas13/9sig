import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

describe("entitlement enforcement wiring",()=>{
  it("re-enforces limits for existing subscribers when a plan is edited",()=>{
    const source=read("src/app/api/admin/plans/route.ts");
    expect(source).toContain("enforceStrategyEntitlements");
    expect(source.indexOf("INSERT INTO plans")).toBeLessThan(source.indexOf("enforceStrategyEntitlements(String(subscriber.user_id))"));
    // Users on a non-live subscription fall back to the free plan, so a free-plan edit must reach them.
    expect(source).toContain("$1='free'");
  });

  it("enforces limits in the cron job before any strategy is calculated",()=>{
    const source=read("src/app/api/cron/actions/route.ts");
    const enforce=source.indexOf("enforceStrategyEntitlements(String(owner.user_id))");
    expect(enforce).toBeGreaterThan(0);
    expect(enforce).toBeLessThan(source.indexOf("calculateAction(String(row.id))"));
  });

  it("keeps account deletion retryable after a partial Stripe cleanup",()=>{
    const source=read("src/app/api/account/delete/route.ts");
    expect(source).toContain('"resource_missing"');
    expect(source.indexOf("stripe.customers.del")).toBeLessThan(source.indexOf("DELETE FROM users"));
  });
});
