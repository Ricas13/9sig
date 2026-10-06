import { describe,expect,it } from "vitest";
import Decimal from "decimal.js";
import { fixedAllocationEngine } from "../src/domain/strategy/fixed-allocation";

describe("fixed allocation engine",()=>{
  it("does not rebalance within threshold",()=>{
    const result=fixedAllocationEngine.calculate({
      strategyInstanceId:"i",strategyVersionId:"v",now:new Date(),baseCurrency:"GBP",cash:new Decimal(0),
      exposures:[{economicExposure:"A",value:new Decimal(52)},{economicExposure:"B",value:new Decimal(48)}],
      contributionsSinceReview:new Decimal(0),state:{},settings:{},config:{allocations:[{exposure:"A",weight:"0.5"},{exposure:"B",weight:"0.5"}],rebalanceThreshold:"0.05"},
      reviewDue:true,dataHealth:{status:"CURRENT"}
    });
    expect(result.actionType).toBe("HOLD");
  });
  it("identifies a rebalance when drift exceeds threshold",()=>{
    const result=fixedAllocationEngine.calculate({
      strategyInstanceId:"i",strategyVersionId:"v",now:new Date(),baseCurrency:"GBP",cash:new Decimal(0),
      exposures:[{economicExposure:"A",value:new Decimal(80)},{economicExposure:"B",value:new Decimal(20)}],
      contributionsSinceReview:new Decimal(0),state:{},settings:{},config:{allocations:[{exposure:"A",weight:"0.5"},{exposure:"B",weight:"0.5"}],rebalanceThreshold:"0.05"},
      reviewDue:true,dataHealth:{status:"CURRENT"}
    });
    expect(result.actionType).toBe("REBALANCE");
    expect(result.amount?.toFixed(2)).toBe("30.00");
  });
});
