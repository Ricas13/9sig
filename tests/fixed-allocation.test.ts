import { describe,expect,it } from "vitest";
import Decimal from "decimal.js";
import { fixedAllocationEngine } from "../src/domain/strategy/fixed-allocation";

function context(input?:{cash?:string;a?:string;b?:string;threshold?:string}){
  return {
    strategyInstanceId:"i",strategyVersionId:"v",now:new Date("2026-10-07T12:00:00Z"),baseCurrency:"GBP",
    cash:new Decimal(input?.cash??"0"),
    exposures:[{economicExposure:"A",value:new Decimal(input?.a??"52")},{economicExposure:"B",value:new Decimal(input?.b??"48")}],
    contributionsSinceReview:new Decimal(0),state:{},settings:{},
    config:{allocations:[{exposure:"A",weight:"0.5"},{exposure:"B",weight:"0.5"}],rebalanceThreshold:input?.threshold??"0.05"},
    reviewDue:true,dataHealth:{status:"CURRENT" as const}
  };
}

describe("fixed allocation engine",()=>{
  it("sums duplicate holdings for the same configured exposure",()=>{
    const result=fixedAllocationEngine.calculate({
      ...context(),
      exposures:[
        {economicExposure:"A",value:new Decimal("26")},
        {economicExposure:"A",value:new Decimal("26")},
        {economicExposure:"B",value:new Decimal("48")}
      ]
    });
    expect(result.actionType).toBe("HOLD");
  });

  it("does not rebalance within threshold",()=>{
    const result=fixedAllocationEngine.calculate(context());
    expect(result.actionType).toBe("HOLD");
  });

  it("uses available cash on an underweight exposure before suggesting a sale",()=>{
    const result=fixedAllocationEngine.calculate(context({cash:"20",a:"60",b:"20",threshold:"0.02"}));
    expect(result.actionType).toBe("BUY");
    expect(result.economicExposure).toBe("B");
    expect(result.amount?.toFixed(2)).toBe("20.00");
    expect(result.completesReview).toBe(false);
  });

  it("sells one overweight exposure first when no cash is available",()=>{
    const result=fixedAllocationEngine.calculate(context({cash:"0",a:"80",b:"20"}));
    expect(result.actionType).toBe("SELL");
    expect(result.economicExposure).toBe("A");
    expect(result.amount?.toFixed(2)).toBe("30.00");
    expect(result.completesReview).toBe(false);
  });

  it("can finish a review with a cash-funded buy when the projected portfolio reaches threshold",()=>{
    const result=fixedAllocationEngine.calculate(context({cash:"10",a:"50",b:"40",threshold:"0.01"}));
    expect(result.actionType).toBe("BUY");
    expect(result.economicExposure).toBe("B");
    expect(result.amount?.toFixed(2)).toBe("10.00");
    expect(result.completesReview).toBe(true);
  });
});
