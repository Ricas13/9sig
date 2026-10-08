import {describe,it,expect} from "vitest";
import Decimal from "decimal.js";
import {momentumRotationEngine} from "../src/domain/strategy/momentum-rotation";
import type {EngineContext} from "../src/domain/strategy/types";
const d=(s:string)=>new Decimal(s);
const context=(now=new Date("2026-10-01T16:00:00Z")):EngineContext=>({
  strategyInstanceId:"a",strategyVersionId:"v",now,baseCurrency:"USD",cash:d("100"),
  exposures:[],contributionsSinceReview:d("0"),state:{},
  config:{riskAssets:["US_EQUITY","INTERNATIONAL_EQUITY"],defensiveAsset:"TREASURY",lookbackMonths:12,reviewFrequency:"MONTHLY",minimumAbsoluteReturn:"0"},
  settings:{},reviewDue:true,dataHealth:{status:"CURRENT"},
  trustedHistory:[
    {exposure:"US_EQUITY",currency:"USD",source:"licensed",points:[{at:new Date("2025-09-30T16:00:00Z"),adjustedClose:d("100")},{at:new Date("2026-09-30T16:00:00Z"),adjustedClose:d("120")}]},
    {exposure:"INTERNATIONAL_EQUITY",currency:"USD",source:"licensed",points:[{at:new Date("2025-09-30T16:00:00Z"),adjustedClose:d("100")},{at:new Date("2026-09-30T16:00:00Z"),adjustedClose:d("110")}]},
    {exposure:"TREASURY",currency:"USD",source:"licensed",points:[{at:new Date("2025-09-30T16:00:00Z"),adjustedClose:d("100")},{at:new Date("2026-09-30T16:00:00Z"),adjustedClose:d("102")}]}
  ]
});
describe("Momentum rotation fail-closed research engine",()=>{
  it("selects strongest positive risk asset",()=>{
    const result=momentumRotationEngine.calculate(context());
    expect(result.actionType).toBe("BUY");expect(result.economicExposure).toBe("US_EQUITY");
  });
  it("selects defensive asset when both equities fall",()=>{
    const ctx=context();
    ctx.trustedHistory![0].points[1].adjustedClose=d("90");
    ctx.trustedHistory![1].points[1].adjustedClose=d("80");
    expect(momentumRotationEngine.calculate(ctx).economicExposure).toBe("TREASURY");
  });
  it("blocks missing or future historical data",()=>{
    const ctx=context();ctx.trustedHistory![0].points[1].at=new Date("2027-01-01Z");
    expect(momentumRotationEngine.calculate(ctx).actionType).toBe("DATA_REQUIRED");
  });
  it("blocks wrong currency and no source data",()=>{
    const ctx=context();ctx.trustedHistory![0].currency="GBP";
    expect(momentumRotationEngine.calculate(ctx).actionType).toBe("DATA_REQUIRED");
    ctx.trustedHistory=undefined;
    expect(momentumRotationEngine.calculate(ctx).actionType).toBe("DATA_REQUIRED");
  });
  it("does not fabricate return from stale observations",()=>{
    const ctx=context(new Date("2026-11-15T16:00:00Z"));
    expect(momentumRotationEngine.calculate(ctx).actionType).toBe("DATA_REQUIRED");
  });
  it("requires strict configuration",()=>{
    expect(()=>momentumRotationEngine.validateConfig({...context().config,lookbackMonths:0})).toThrow();
  });
});
