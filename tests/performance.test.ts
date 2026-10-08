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

describe("money-weighted return is never an unconverged guess",()=>{
  const day=86_400_000;
  // Independent reference: bisection on the NPV in plain floating point.
  function reference(flows:Array<{at:Date;amount:number}>){
    const base=flows[0].at.getTime();
    const npv=(r:number)=>flows.reduce((s,f)=>s+f.amount/Math.pow(1+r,(f.at.getTime()-base)/(365.25*day)),0);
    let lo=-0.999,hi=1000;
    if(npv(lo)*npv(hi)>0)return null;
    for(let i=0;i<300;i++){const mid=(lo+hi)/2;if(npv(lo)*npv(mid)<=0)hi=mid;else lo=mid;}
    return (lo+hi)/2;
  }

  it("agrees with an independent solver on thousands of realistic portfolios, including heavy losses",()=>{
    let seed=12345;
    const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
    let compared=0;let losers=0;
    for(let n=0;n<1500;n++){
      const flows:Array<{at:Date;amount:number}>=[];
      let t=Date.UTC(2024,0,1);let invested=0;
      const count=2+Math.floor(rnd()*8);
      for(let i=0;i<count-1;i++){const amount=-(50+rnd()*5000);invested+=-amount;flows.push({at:new Date(t),amount});t+=(1+rnd()*120)*day;}
      flows.push({at:new Date(t+rnd()*30*day),amount:invested*(0.4+rnd()*2.1)});
      const expected=reference(flows);
      if(expected===null)continue;
      compared+=1;if(expected<-0.5)losers+=1;
      const got=xirr(flows).toNumber();
      expect(Math.abs(got-expected),`expected ${expected} got ${got}`).toBeLessThan(1e-6*Math.max(1,Math.abs(expected)));
    }
    expect(compared).toBeGreaterThan(1400);
    expect(losers).toBeGreaterThan(50);   // the case the old implementation got wrong must be covered
  });

  it("reports a deep loss as a loss",()=>{
    const irr=xirr([{at:new Date("2025-01-01T00:00:00Z"),amount:-1000},{at:new Date("2026-01-01T00:00:00Z"),amount:200}]);
    expect(irr.toNumber()).toBeCloseTo(-0.8,2);   // 365 days is slightly under a 365.25-day year
  });

  it("is independent of the order the flows are supplied in",()=>{
    const flows=[
      {at:new Date("2025-01-01T00:00:00Z"),amount:-1000},
      {at:new Date("2025-06-01T00:00:00Z"),amount:-500},
      {at:new Date("2026-01-01T00:00:00Z"),amount:1800}
    ];
    expect(xirr([...flows].reverse()).toNumber()).toBeCloseTo(xirr(flows).toNumber(),9);
  });

  it("refuses inputs that have no meaningful answer instead of inventing one",()=>{
    const same=new Date("2025-01-01T00:00:00Z");
    expect(()=>xirr([{at:same,amount:-100},{at:same,amount:110}])).toThrow("at least two dates");
    expect(()=>xirr([{at:same,amount:-100}])).toThrow();
    expect(()=>xirr([{at:same,amount:-100},{at:new Date("2026-01-01T00:00:00Z"),amount:-5}])).toThrow("positive and negative");
    // Doubling in a day annualises past the supported range: refuse rather than report a wrong value.
    expect(()=>xirr([{at:same,amount:-100},{at:new Date("2025-01-02T00:00:00Z"),amount:100000}])).toThrow();
  });
});
