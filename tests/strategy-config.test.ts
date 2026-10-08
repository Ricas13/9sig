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

describe("strict input validation",()=>{
  const field=(over:Record<string,unknown>)=>parseInputSchema([{key:"f",label:"F",...over}]);

  it("rejects values that are not clearly true or false instead of turning them into false",()=>{
    const schema=field({type:"boolean"});
    expect(validateInstanceSettings(schema,{f:true})).toEqual({f:true});
    expect(validateInstanceSettings(schema,{f:"true"})).toEqual({f:true});
    expect(validateInstanceSettings(schema,{f:false})).toEqual({f:false});
    expect(validateInstanceSettings(schema,{f:"false"})).toEqual({f:false});
    for(const bad of ["yes","no","1",1,0,"TRUE","maybe",{}])expect(()=>validateInstanceSettings(schema,{f:bad}),String(bad)).toThrow("INVALID_STRATEGY_INPUT:f");
  });

  it("rejects dates that are not on the calendar",()=>{
    const schema=field({type:"date"});
    expect(validateInstanceSettings(schema,{f:"2032-02-29"})).toEqual({f:"2032-02-29"});
    for(const bad of ["2031-02-29","2030-02-31","2030-13-01","2030-00-10","2030-04-31","20300101","2030-1-1"])
      expect(()=>validateInstanceSettings(schema,{f:bad}),bad).toThrow("INVALID_STRATEGY_INPUT:f");
  });

  it("reports garbage numbers as validation errors, not raw decimal errors",()=>{
    const schema=field({type:"number"});
    for(const bad of ["abc","1e999999999","NaN","Infinity",{},[]])expect(()=>validateInstanceSettings(schema,{f:bad})).toThrow("INVALID_STRATEGY_INPUT:f");
  });

  it("does not mistake inherited object members for user input",()=>{
    for(const key of ["constructor","toString","valueOf","hasOwnProperty"]){
      const schema=parseInputSchema([{key,label:"X",type:"text"}]);
      expect(validateInstanceSettings(schema,{}),key).toEqual({});
      expect(validateInstanceSettings(schema,{[key]:"mine"}),key).toEqual({[key]:"mine"});
    }
  });

  it("bounds free text",()=>{
    const schema=field({type:"text"});
    expect(()=>validateInstanceSettings(schema,{f:"x".repeat(501)})).toThrow("INVALID_STRATEGY_INPUT:f");
    expect(validateInstanceSettings(schema,{f:"x".repeat(500)})).toEqual({f:"x".repeat(500)});
  });

  it("rejects malformed schemas: duplicate keys, duplicate or empty options, bad bounds and defaults",()=>{
    expect(()=>parseInputSchema([{key:"a",label:"A",type:"text"},{key:"a",label:"B",type:"text"}])).toThrow("INVALID_INPUT_SCHEMA");
    expect(()=>parseInputSchema([{key:"a",label:"A",type:"select",options:[{label:"1",value:"x"},{label:"2",value:"x"}]}])).toThrow("INVALID_INPUT_SCHEMA");
    expect(()=>parseInputSchema([{key:"a",label:"A",type:"select",options:[{label:"1",value:""}]}])).toThrow("INVALID_INPUT_SCHEMA");
    expect(()=>parseInputSchema([{key:"a",label:"A",type:"number",min:10,max:1}])).toThrow("INVALID_INPUT_SCHEMA");
    expect(()=>parseInputSchema([{key:"a",label:"A",type:"number",min:"abc"}])).toThrow("INVALID_INPUT_SCHEMA");
    expect(()=>parseInputSchema([{key:"a",label:"A",type:"number",default:"abc"}])).toThrow("INVALID_INPUT_SCHEMA");
    expect(()=>parseInputSchema([{key:"a",label:"A",type:"date",default:"2030-02-31"}])).toThrow("INVALID_INPUT_SCHEMA");
    expect(()=>parseInputSchema([{key:"a",label:"A",type:"boolean",default:"maybe"}])).toThrow("INVALID_INPUT_SCHEMA");
    expect(()=>parseInputSchema([{key:"a",label:"A",type:"select",options:[{label:"1",value:"x"}],default:"y"}])).toThrow("INVALID_INPUT_SCHEMA");
  });

  it("still accepts well-formed schemas with defaults",()=>{
    const schema=parseInputSchema([
      {key:"day",label:"Day",type:"number",min:1,max:31,default:15},
      {key:"since",label:"Since",type:"date",default:"2030-01-31"},
      {key:"on",label:"On",type:"boolean",default:true},
      {key:"mode",label:"Mode",type:"select",options:[{label:"A",value:"a"},{label:"B",value:"b"}],default:"b"}
    ]);
    expect(validateInstanceSettings(schema,{})).toEqual({day:"15",since:"2030-01-31",on:true,mode:"b"});
  });
});
