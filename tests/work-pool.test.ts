import { describe,expect,it } from "vitest";
import { runBounded } from "../src/lib/work-pool";

const sleep=(ms:number)=>new Promise<void>((resolve)=>setTimeout(resolve,ms));

describe("bounded work pool",()=>{
  it("never exceeds the concurrency limit and handles every item exactly once",async()=>{
    let inFlight=0;let peak=0;const seen:number[]=[];
    const result=await runBounded(Array.from({length:25},(_,i)=>i),{concurrency:4},async(item)=>{
      inFlight+=1;peak=Math.max(peak,inFlight);
      await sleep(2+(item%3));
      seen.push(item);
      inFlight-=1;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect([...seen].sort((a,b)=>a-b)).toEqual(Array.from({length:25},(_,i)=>i));
    expect(result).toEqual({started:25,deferred:0});
  });

  it("hands items out in order",async()=>{
    const started:number[]=[];
    await runBounded([0,1,2,3,4,5],{concurrency:2},async(item)=>{started.push(item);await sleep(1);});
    expect(started).toEqual([0,1,2,3,4,5]);
  });

  it("stops handing out work when asked and reports what was deferred",async()=>{
    let handled=0;
    const result=await runBounded(Array.from({length:10},(_,i)=>i),{concurrency:1,shouldStop:()=>handled>=3},async()=>{handled+=1;});
    expect(handled).toBe(3);
    expect(result).toEqual({started:3,deferred:7});
  });

  it("copes with no items and with a nonsensical concurrency",async()=>{
    expect(await runBounded([],{concurrency:4},async()=>{})).toEqual({started:0,deferred:0});
    const seen:number[]=[];
    expect(await runBounded([1,2,3],{concurrency:0},async(x)=>{seen.push(x);})).toEqual({started:3,deferred:0});
    expect(seen).toEqual([1,2,3]);
  });

  it("lets in-flight work finish after a stop request, and defers the rest",async()=>{
    let stop=false;const finished:number[]=[];
    const result=await runBounded([0,1,2,3],{concurrency:2,shouldStop:()=>stop},async(item)=>{
      await sleep(5);                 // both workers have an item in flight before the stop request
      if(item===0)stop=true;
      await sleep(5);
      finished.push(item);
    });
    expect([...finished].sort()).toEqual([0,1]);
    expect(result).toEqual({started:2,deferred:2});
  });
});
