import {describe,it,expect} from "vitest";
import {calculateSimpleRebalance as calc} from "../src/domain/public-rebalance-calculator";
describe("educational two-asset rebalancer",()=>{
 it("computes sell to restore target percentage",()=>{
  expect(calc("10000","6500","60")).toMatchObject({targetValue:"6000.00",delta:"-500.00",absoluteAmount:"500.00",action:"SELL"});
 });
 it("computes buy and no-trade cases",()=>{
  expect(calc("10000","5400","60").action).toBe("BUY");
  expect(calc("10000","6000","60").action).toBe("HOLD");
 });
 it("uses stable decimal rounding",()=>{
  expect(calc("100.01","20","33.333333").targetValue).toBe("33.34");
 });
 it("refuses negative/overallocated/non-finite inputs",()=>{
  expect(()=>calc("-1","0","60")).toThrow();
  expect(()=>calc("10","20","60")).toThrow();
  expect(()=>calc("10","3","101")).toThrow();
  expect(()=>calc("Infinity","3","60")).toThrow();
 });
});
