import { describe,expect,it } from "vitest";
import { timeWeightedReturn,xirr } from "../src/domain/performance";

describe("performance methods",()=>{
  it("does not count deposits as investment return",()=>{
    const twr=timeWeightedReturn([{startValue:100,endValue:160,netFlow:50}]);
    expect(twr.toNumber()).toBeCloseTo(0.10,10);
  });
  it("computes money-weighted return from dated cash flows",()=>{
    const irr=xirr([{at:new Date("2025-01-01T00:00:00Z"),amount:-1000},{at:new Date("2026-01-01T00:00:00Z"),amount:1100}]);
    expect(irr.toNumber()).toBeCloseTo(0.10,3);
  });
});
