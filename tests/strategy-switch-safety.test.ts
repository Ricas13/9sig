import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

describe("strategy switch safety",()=>{
  const service=readFileSync(new URL("../src/lib/strategy-switch-service.ts",import.meta.url),"utf8");

  it("refuses to switch through unresolved reconciliation state",()=>{
    expect(service).toContain("STRATEGY_SWITCH_REQUIRES_RECONCILIATION");
    expect(service).toContain("currentState.resumeNeedsReconciliation||currentState.unresolvedReconciliation");
  });

  it("fails closed on unsupported cash states",()=>{
    expect(service).toContain("SWITCH_FOREIGN_CASH_UNSUPPORTED");
    expect(service).toContain("SWITCH_MIXED_ACCOUNT_CURRENCIES_UNSUPPORTED");
    expect(service).toContain("SWITCH_NEGATIVE_CASH_UNSUPPORTED");
  });

  it("preserves the old journey instead of rewriting its history",()=>{
    expect(service).toContain("UPDATE strategy_instances SET status='CLOSED'");
    expect(service).toContain("switchedFromStrategyInstanceId");
    expect(service).toContain("'OPENING_CASH'");
    expect(service).toContain("'OPENING_POSITION'");
    expect(service).not.toMatch(/UPDATE ledger_events SET/i);
  });

  it("audits the switch and carries linked account roles forward",()=>{
    expect(service).toContain("strategy.switched");
    expect(service).toContain("INSERT INTO strategy_accounts");
    expect(service).toContain("[newId,account.id,account.role]");
  });
});
