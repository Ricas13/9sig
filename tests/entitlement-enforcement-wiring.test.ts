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

  it("keeps account deletion retryable and locks the account before touching Stripe",()=>{
    const route=read("src/app/api/account/delete/route.ts");
    const service=read("src/lib/account-deletion.ts");
    expect(service).toContain('"resource_missing"');
    // Execution order: begin marks the account deleted without any external call; finish disconnects
    // Stripe first and only then purges.
    const begin=service.slice(service.indexOf("export async function beginAccountDeletion"),service.indexOf("export async function finishAccountDeletion"));
    expect(begin).toContain("UPDATE users SET deleted_at");
    expect(begin).not.toContain("stripe.");
    const finish=service.slice(service.indexOf("export async function finishAccountDeletion"),service.indexOf("export async function finishPendingAccountDeletions"));
    expect(finish.indexOf("disconnectBilling(userId)")).toBeGreaterThan(-1);
    expect(finish.indexOf("disconnectBilling(userId)")).toBeLessThan(finish.indexOf("DELETE FROM users"));
    expect(route.indexOf("beginAccountDeletion")).toBeLessThan(route.indexOf("finishAccountDeletion"));
    // The hourly worker finishes stalled deletions.
    expect(read("src/app/api/cron/actions/route.ts")).toContain("finishPendingAccountDeletions");
  });
});

describe("ledger write paths",()=>{
  it("validates every trade, cash and contribution row at the write",()=>{
    for(const path of ["src/lib/action-service.ts","src/app/api/strategies/[id]/ledger-events/route.ts","src/app/api/strategies/[id]/contributions/route.ts"]){
      const source=read(path);
      expect(source).toContain("assertLedgerEvent(");
      expect(source.indexOf("assertLedgerEvent(")).toBeLessThan(source.indexOf("INSERT INTO ledger_events"));
    }
  });

  it("treats corrections like other mutations: closed strategies are read-only and recalculation failures are surfaced",()=>{
    const source=read("src/app/api/strategies/[id]/ledger-events/[eventId]/correct/route.ts");
    expect(source).toContain('throw new Error("STRATEGY_CLOSED")');
    expect(source).toContain("recalculateAfterMutation(");
    expect(source).not.toMatch(/try\{[^}]*calculateAction/);
  });
});

describe("revoked sessions",()=>{
  it("sends pages and layouts with a revoked session to sign-in instead of an error page",()=>{
    const session=read("src/lib/session.ts");
    expect(session).toContain("export async function requirePageUser");
    expect(session).toContain('redirect("/login")');
    for(const path of ["src/app/app/layout.tsx","src/app/app/page.tsx","src/app/app/settings/page.tsx","src/app/app/strategies/page.tsx","src/app/app/strategies/[id]/page.tsx","src/app/app/strategies/new/page.tsx","src/app/app/notifications/page.tsx","src/app/admin/layout.tsx"]){
      const source=read(path);
      expect(source).toContain("requirePageUser");
      expect(source).not.toMatch(/\brequireUser\b/);
    }
  });

  it("audits a plan edit before enforcing it on subscribers",()=>{
    const source=read("src/app/api/admin/plans/route.ts");
    expect(source.indexOf("'plan.upsert'")).toBeLessThan(source.indexOf("enforceStrategyEntitlements(String(subscriber.user_id))"));
  });
});
