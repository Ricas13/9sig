import { describe,expect,it } from "vitest";
import { parseInputSchema,validateInstanceSettings } from "../src/domain/strategy/config";
import { validateEngineConfig } from "../src/domain/strategy/registry";

describe("data-driven strategy configuration",()=>{
  it("validates value-target releases before they can be published",()=>{
    expect(()=>validateEngineConfig("VALUE_TARGET",{
      targetExposure:"NASDAQ_100_3X_LONG",initialTargetRatio:"0.60",targetRate:"0.09",
      contributionTargetRatio:"0.50",maxCashUse:"0.90",tolerance:"0.01",reviewFrequency:"QUARTERLY"
    })).not.toThrow();
    expect(()=>validateEngineConfig("VALUE_TARGET",{targetExposure:"",initialTargetRatio:"0.60"})).toThrow();
  });

  it("rejects fixed-allocation releases whose weights do not sum to one",()=>{
    expect(()=>validateEngineConfig("FIXED_ALLOCATION",{
      allocations:[{exposure:"A",weight:"0.6"},{exposure:"B",weight:"0.3"}],rebalanceThreshold:"0.05"
    })).toThrow("FIXED_ALLOCATION_WEIGHTS_MUST_SUM_TO_ONE");
  });

  it("validates dynamic per-instance inputs without hard-coded form fields",()=>{
    const schema=parseInputSchema([
      {key:"reviewDay",label:"Review day",type:"number",required:true,min:1,max:31},
      {key:"mode",label:"Mode",type:"select",options:[{label:"Standard",value:"standard"},{label:"Conservative",value:"conservative"}]}
    ]);
    const settings=validateInstanceSettings(schema,{reviewDay:"15",mode:"standard"});
    expect(settings).toEqual({reviewDay:"15",mode:"standard"});
    expect(()=>validateInstanceSettings(schema,{reviewDay:"40",mode:"standard"})).toThrow();
  });
});
