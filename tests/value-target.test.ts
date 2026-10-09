import { describe,expect,it } from "vitest";
import Decimal from "decimal.js";
import { valueTargetEngine } from "../src/domain/strategy/value-target";

const base={
  strategyInstanceId:"i",strategyVersionId:"v",now:new Date("2026-10-01T12:00:00Z"),baseCurrency:"GBP",
  cash:new Decimal(4000),exposures:[],contributionsSinceReview:new Decimal(10000),state:{forceReview:true},settings:{},
  config:{targetExposure:"NASDAQ_100_3X_LONG",initialTargetRatio:"0.60",targetRate:"0.09",contributionTargetRatio:"0.50",maxCashUse:"0.90",tolerance:"0.01"},
  reviewDue:true,nextReviewAt:new Date("2026-10-01T12:00:00Z"),dataHealth:{status:"CURRENT" as const}
};

describe("value-target engine",()=>{
  it("uses the explicit initial allocation rule for the first review",()=>{
    const result=valueTargetEngine.calculate(base);
    expect(result.actionType).toBe("BUY");
    expect(result.amount?.toFixed(2)).toBe("2400.00");
  });
  it("freezes the initial target through a multi-fill investment instead of resetting it after fees",()=>{
    const ctx={...base,cash:new Decimal("4000"),exposures:[],
      state:{forceReview:true,reviewTargetValue:"6000"}};
    const first=valueTargetEngine.calculate(ctx);
    expect(first.amount?.toFixed(2)).toBe("3600.00");
    const second=valueTargetEngine.calculate({...ctx,cash:new Decimal("400"),
      exposures:[{economicExposure:"NASDAQ_100_3X_LONG",value:new Decimal("3600")} ]});
    expect(second.explanation.find(x=>x.label==="Initial target")?.value).toBe("6000.00");
    expect(second.amount?.toFixed(2)).toBe("360.00");
  });
  it("freezes an existing 9Sig quarterly growth target until all partial fills are confirmed",()=>{
    const state={targetValue:"6000",reviewTargetValue:"6540",forceReview:true};
    const ctx={...base,state,cash:new Decimal("3000"),contributionsSinceReview:new Decimal("0"),
      exposures:[{economicExposure:"NASDAQ_100_3X_LONG",value:new Decimal("6300")}]};
    const result=valueTargetEngine.calculate(ctx);
    expect(result.explanation.find(x=>x.label==="Review target")?.value).toBe("6540.00");
    expect(result.amount?.toFixed(2)).toBe("240.00");
    const settled=valueTargetEngine.calculate({...ctx,exposures:[{economicExposure:"NASDAQ_100_3X_LONG",value:new Decimal("6540")}],cash:new Decimal("2760")});
    expect(settled.actionType).toBe("HOLD");
    expect(settled.nextState.targetValue).toBe("6540");
  });
  it("sums the same economic exposure across multiple holdings",()=>{
    const result=valueTargetEngine.calculate({
      ...base,
      cash:new Decimal(10000),
      exposures:[
        {economicExposure:"NASDAQ_100_3X_LONG",value:new Decimal(6000)},
        {economicExposure:"NASDAQ_100_3X_LONG",value:new Decimal(4000)}
      ],
      state:{targetValue:"10000"},
      contributionsSinceReview:new Decimal(0),
      config:{...base.config,targetRate:"0.09"}
    });
    expect(result.amount?.toFixed(2)).toBe("900.00");
  });

  it("fails closed when a resumed account contains an unmanaged holding",()=>{
    const result=valueTargetEngine.calculate({
      ...base,
      exposures:[{economicExposure:"OTHER_ASSET",value:new Decimal(1000)}]
    });
    expect(result.actionType).toBe("DATA_REQUIRED");
    expect(result.title).toContain("classification");
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
