import { describe,expect,it } from "vitest";
import Decimal from "decimal.js";
import { valueTargetEngine } from "../src/domain/strategy/value-target";

const base={
  strategyInstanceId:"i",strategyVersionId:"v",now:new Date("2026-10-01T12:00:00Z"),baseCurrency:"GBP",
  cash:new Decimal(4000),exposures:[],contributionsSinceReview:new Decimal(10000),state:{forceReview:true},
  config:{targetExposure:"NASDAQ_100_3X_LONG",initialTargetRatio:"0.60",targetRate:"0.09",contributionTargetRatio:"0.50",maxCashUse:"0.90",tolerance:"0.01"},
  reviewDue:true,nextReviewAt:new Date("2026-10-01T12:00:00Z"),dataHealth:{status:"CURRENT" as const}
};

describe("value-target engine",()=>{
  it("uses the explicit initial allocation rule for the first review",()=>{
    const result=valueTargetEngine.calculate(base);
    expect(result.actionType).toBe("BUY");
    expect(result.amount?.toFixed(2)).toBe("3600.00");
  });
  it("fails closed when critical data is stale",()=>{
    const result=valueTargetEngine.calculate({...base,dataHealth:{status:"STALE" as const,message:"stale"}});
    expect(result.actionType).toBe("DATA_REQUIRED");
    expect(result.confidence).toBe("LOW");
  });
  it("keeps strategy versions reproducible by accepting version config explicitly",()=>{
    const old=valueTargetEngine.calculate({...base,cash:new Decimal(10000),exposures:[{economicExposure:"NASDAQ_100_3X_LONG",value:new Decimal(10000)}],state:{targetValue:"10000"},contributionsSinceReview:new Decimal(0),config:{...base.config,targetRate:"0.06"}});
    const newer=valueTargetEngine.calculate({...base,cash:new Decimal(10000),exposures:[{economicExposure:"NASDAQ_100_3X_LONG",value:new Decimal(10000)}],state:{targetValue:"10000"},contributionsSinceReview:new Decimal(0),config:{...base.config,targetRate:"0.09"}});
    expect(old.amount?.toFixed(2)).toBe("600.00");
    expect(newer.amount?.toFixed(2)).toBe("900.00");
  });
});
