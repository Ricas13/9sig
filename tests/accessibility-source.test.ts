import {describe,expect,it} from "vitest";
import {readFileSync,readdirSync,statSync} from "node:fs";
import {join} from "node:path";

const walk=(dir:string):string[]=>readdirSync(dir).flatMap((name)=>{
 const full=join(dir,name);
 return statSync(full).isDirectory()?walk(full):[full];
});
const sources=walk("src").filter((f)=>f.endsWith(".tsx")).map((f)=>({f,text:readFileSync(f,"utf8")}));

describe("accessibility rules that only show up with real data",()=>{
 it("makes every horizontally scrollable table keyboard-reachable",()=>{
  // axe only reports this when a table is wide enough to scroll, which depends on the data in CI.
  const offenders:string[]=[];
  for(const {f,text} of sources){
   for(const m of text.matchAll(/<div className="table-wrap"[^>]*>/g)){
    if(!/tabIndex=\{0\}/.test(m[0])||!/role="region"/.test(m[0])||!/aria-label=/.test(m[0]))offenders.push(f);
   }
  }
  expect(offenders).toEqual([]);
 });
 it("never leaves a bare <label> without a control to describe",()=>{
  const offenders=sources.filter(({text})=>/<label>(?!<input)/.test(text)).map(({f})=>f);
  expect(offenders).toEqual([]);
 });
});
