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

describe("month-end contribution schedules",()=>{
  const walk=(start:string,frequency:"MONTHLY"|"QUARTERLY",steps:number,anchorDay?:number)=>{
    const dates=[start];
    let current=start;
    for(let i=0;i<steps;i++){current=addContributionPeriod(current,frequency,anchorDay);dates.push(current);}
    return dates;
  };

  it("returns to the 31st after a short month instead of drifting to the 28th",()=>{
    const plan=normalizeContributionPlan({enabled:true,amount:"100",frequency:"MONTHLY",nextDate:"2030-01-31"});
    expect(plan.anchorDay).toBe(31);
    expect(walk("2030-01-31","MONTHLY",5,plan.anchorDay)).toEqual(["2030-01-31","2030-02-28","2030-03-31","2030-04-30","2030-05-31","2030-06-30"]);
  });

  it("keeps a quarterly 30th anchored through February",()=>{
    expect(walk("2030-11-30","QUARTERLY",4,30)).toEqual(["2030-11-30","2031-02-28","2031-05-30","2031-08-30","2031-11-30"]);
  });

  it("stays correct when a plan is advanced several periods at once and across a leap year",()=>{
    const plan=normalizeContributionPlan({enabled:true,amount:"100",frequency:"MONTHLY",nextDate:"2031-12-31"});
    expect(advanceContributionPlan(plan,"2032-03-31").nextDate).toBe("2032-04-30");
    expect(walk("2031-12-31","MONTHLY",2,31)).toEqual(["2031-12-31","2032-01-31","2032-02-29"]);
  });

  it("keeps the anchor across a stored, already clamped plan but accepts a new date the user chooses",()=>{
    const stored=normalizeContributionPlan({enabled:true,amount:"100",frequency:"MONTHLY",nextDate:"2030-02-28",anchorDay:31});
    expect(stored.anchorDay).toBe(31);
    const changed=normalizeContributionPlan({enabled:true,amount:"100",frequency:"MONTHLY",nextDate:"2030-02-15",anchorDay:31});
    expect(changed.anchorDay).toBeUndefined();
  });

  it("does not store an anchor for ordinary days or weekly plans",()=>{
    expect(normalizeContributionPlan({enabled:true,amount:"1",frequency:"MONTHLY",nextDate:"2030-01-15"}).anchorDay).toBeUndefined();
    expect(normalizeContributionPlan({enabled:true,amount:"1",frequency:"WEEKLY",nextDate:"2030-01-31"}).anchorDay).toBeUndefined();
  });

  it("starts a new plan from the user's local date, not the UTC date",()=>{
    const instant=new Date("2030-06-01T20:00:00Z");   // 08:00 on 2 June in Auckland
    expect(normalizeContributionPlan({enabled:true,amount:"10",frequency:"WEEKLY"},instant,"Pacific/Auckland").nextDate).toBe("2030-06-09");
    expect(normalizeContributionPlan({enabled:true,amount:"10",frequency:"WEEKLY"},instant,"America/Los_Angeles").nextDate).toBe("2030-06-08");
  });
});
