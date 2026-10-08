import { describe, expect, it } from "vitest";
import { addContributionPeriod, advanceContributionPlan, normalizeContributionPlan } from "../src/domain/contribution-plan";

describe("contribution plans",()=>{
  it("creates a next monthly date without changing portfolio cash",()=>{
    const plan=normalizeContributionPlan({enabled:true,amount:"500",frequency:"MONTHLY"},new Date("2026-10-07T12:00:00Z"));
    expect(plan).toEqual({enabled:true,amount:"500",frequency:"MONTHLY",nextDate:"2026-11-07"});
  });

  it("clamps month-end schedules instead of skipping a month",()=>{
    expect(addContributionPeriod("2027-01-31","MONTHLY")).toBe("2027-02-28");
  });

  it("advances late contribution reminders past the recorded deposit date",()=>{
    const plan={enabled:true,amount:"100",frequency:"WEEKLY" as const,nextDate:"2026-10-01"};
    expect(advanceContributionPlan(plan,"2026-10-20").nextDate).toBe("2026-10-22");
  });

  it("does not advance a reminder for an early deposit",()=>{
    const plan={enabled:true,amount:"100",frequency:"MONTHLY" as const,nextDate:"2026-11-01"};
    expect(advanceContributionPlan(plan,"2026-10-20").nextDate).toBe("2026-11-01");
  });

  it("requires a positive amount only when reminders are enabled",()=>{
    expect(normalizeContributionPlan({enabled:false,amount:"0",frequency:"MONTHLY"}).enabled).toBe(false);
    expect(()=>normalizeContributionPlan({enabled:true,amount:"0",frequency:"MONTHLY"})).toThrow("INVALID_CONTRIBUTION_AMOUNT");
  });
});
