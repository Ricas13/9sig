import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {RESEARCH_STRATEGIES} from "@/domain/strategy/research-catalog";
import {supportedEngineKeys,validateEngineConfig} from "@/domain/strategy/registry";

// The seed, the reference catalogue and the engine registry must agree on engine names and on the
// preset configurations, or a strategy can be created that no engine will calculate.
describe("strategy catalogue consistency",()=>{
 const engines=new Set(supportedEngineKeys());

 it("every catalogue entry names a registered engine (or is explicitly pending)",()=>{
  const unknown=RESEARCH_STRATEGIES.filter((s)=>s.engine!=="CUSTOM_PENDING"&&!engines.has(s.engine)).map((s)=>s.key+":"+s.engine);
  expect(unknown).toEqual([]);
 });

 it("every engine named in the seed is registered",()=>{
  const seed=readFileSync("scripts/seed.ts","utf8");
  const block=seed.slice(seed.indexOf("const definitions=["),seed.indexOf("] as const;"));
  const named=[...block.matchAll(/,"([A-Z_]+)",(?:true|false),(?:true|false)\]/g)].map((m)=>m[1]);
  expect(named.length).toBeGreaterThanOrEqual(4);
  expect(named.filter((e)=>!engines.has(e))).toEqual([]);
 });

 it("seeds the fixed-allocation presets from the catalogue instead of a second inline copy",()=>{
  const seed=readFileSync("scripts/seed.ts","utf8");
  expect(seed).toContain("RESEARCH_STRATEGIES");
  expect(seed).not.toMatch(/exposure:"US_EQUITY_3X_LONG"/);
  expect(seed).not.toMatch(/exposure:"US_SMALL_CAP_VALUE"/);
 });

 it("every fixed-allocation catalogue config passes its engine's own validation and sums to 100%",()=>{
  for(const s of RESEARCH_STRATEGIES.filter((x)=>x.engine==="FIXED_ALLOCATION"&&x.config)){
   expect(()=>validateEngineConfig("FIXED_ALLOCATION",s.config!),s.key).not.toThrow();
  }
 });
});

import {parseInputSchema,validateInstanceSettings} from "@/domain/strategy/config";
import {effectiveAllocations} from "@/domain/strategy/fixed-allocation";

describe("investor-chosen weights in the catalogue",()=>{
 const chosen=RESEARCH_STRATEGIES.filter((s)=>(s.config as {userWeights?:boolean}|undefined)?.userWeights===true);

 it("exactly the strategies without a canonical split let the investor choose",()=>{
  expect(chosen.map((s)=>s.key).sort()).toEqual(["60-40","80-20","three-fund"]);
 });

 it("each exposure has one number field whose default reproduces the illustrative weight",()=>{
  for(const s of chosen){
   const fields=parseInputSchema(s.inputSchema);
   const allocations=(s.config as {allocations:Array<{exposure:string;weight:string}>}).allocations;
   expect(fields.map((f)=>f.key),s.key).toEqual(allocations.map((a)=>"weight_"+a.exposure));
   const settings=validateInstanceSettings(fields,{});
   expect(effectiveAllocations(s.config!,settings)?.map((a)=>String(Number(a.weight))),s.key).toEqual(allocations.map((a)=>String(Number(a.weight))));
  }
 });

 it("the investor can change the split, but not to one that fails to total 100%",()=>{
  const sixty=RESEARCH_STRATEGIES.find((s)=>s.key==="60-40")!;
  const fields=parseInputSchema(sixty.inputSchema);
  const ok=validateInstanceSettings(fields,{weight_BROAD_EQUITY:"0.7",weight_AGGREGATE_BONDS:"0.3"});
  expect(effectiveAllocations(sixty.config!,ok)).not.toBeNull();
  const bad=validateInstanceSettings(fields,{weight_BROAD_EQUITY:"0.7",weight_AGGREGATE_BONDS:"0.4"});
  expect(effectiveAllocations(sixty.config!,bad)).toBeNull();
  expect(()=>validateInstanceSettings(fields,{weight_BROAD_EQUITY:"1.5"})).toThrow("INVALID_STRATEGY_INPUT:weight_BROAD_EQUITY");
 });
});
