import {describe,it,expect} from "vitest";
import Decimal from "decimal.js";
import {paaReferenceAllocation} from "../src/domain/strategy/paa-signals";
import type {TrustedHistoricalSeries} from "../src/domain/strategy/types";
const risky=Array.from({length:12},(_,i)=>"R"+i),safe=["BOND"];
const dataset=(bad=0):TrustedHistoricalSeries[]=>[...risky,...safe].map((exposure,index)=>({
 exposure,currency:"USD",source:"licensed",
 points:Array.from({length:13},(_,i)=>({
  at:new Date(Date.UTC(2025+Math.floor((9+i)/12),(9+i)%12,25)),
  adjustedClose:new Decimal(index<bad?130-i:100+i)
 }))
}));
function calc(bad=0,h=dataset(bad)){return paaReferenceAllocation({riskAssets:risky,safeAssets:safe,history:h,currency:"USD",reviewMonth:"2026-10"});}
describe("PAA research-only breadth and monthly signals",()=>{
 it("invests in top six positive risk assets",()=>{
  const out=calc();expect(out.length).toBe(6);
  expect(out.reduce((a,v)=>a.plus(v.weight),new Decimal(0)).eq(1)).toBe(true);
 });
 it("uses half defensive with three negative risk signals",()=>{
  const out=calc(3);
  expect(out.find(x=>x.exposure==="BOND")?.weight).toBe("0.5");
 });
 it("switches fully to safe asset when six signals negative",()=>{
  expect(calc(6)).toEqual([{exposure:"BOND",weight:"1"}]);
 });
 it("rejects incomplete historical data",()=>{
  const h=dataset();h[0].points.pop();expect(()=>calc(0,h)).toThrow("PAA_HISTORY_UNAVAILABLE");
 });
});
