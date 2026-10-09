import {describe,expect,it} from "vitest";
import {rebaseIndexedWindow} from "@/domain/chart-window";

describe("selected-period benchmark comparison",()=>{
 it("starts actual, model and benchmarks at 100 on the selected first valuation",()=>{
  const rows=rebaseIndexedWindow([
   {date:"2026-06-01",actual:125,model:110,benchmark:102,benchmarkValues:{spy:120,qqq:140}},
   {date:"2026-07-01",actual:150,model:99,benchmark:107.1,benchmarkValues:{spy:126,qqq:133}}
  ]);
  expect(rows[0]).toMatchObject({actual:100,model:100,benchmark:100,benchmarkValues:{spy:100,qqq:100}});
  expect(rows[1].actual).toBeCloseTo(120);
  expect(rows[1].model).toBeCloseTo(90);
  expect(rows[1].benchmark).toBeCloseTo(105);
  expect(rows[1].benchmarkValues?.spy).toBeCloseTo(105);
  expect(rows[1].benchmarkValues?.qqq).toBeCloseTo(95);
 });
 it("refuses a benchmark starting after the period start instead of claiming comparable growth",()=>{
  const rows=rebaseIndexedWindow([
   {date:"2026-06-01",actual:100,benchmarkValues:{spy:100}},
   {date:"2026-06-02",actual:103,benchmarkValues:{spy:104,qqq:50}}
  ]);
  expect(rows[1].benchmarkValues?.qqq).toBeUndefined();
  expect(rows[1].benchmarkValues?.spy).toBe(104);
 });
 it("refuses zero, negative or invalid baselines and does not mutate the original points",()=>{
  const raw=[{date:"2026-06-01",actual:0,model:100,benchmarkValues:{spy:-100}},
   {date:"2026-06-02",actual:20,model:110,benchmarkValues:{spy:50}}];
  const rows=rebaseIndexedWindow(raw);
  expect(rows[1].actual).toBeUndefined();
  expect(rows[1].benchmarkValues?.spy).toBeUndefined();
  expect(rows[1].model).toBeCloseTo(110);
  expect(raw[0].model).toBe(100);
  expect(rebaseIndexedWindow([])).toEqual([]);
 });
});
