import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const read=(path:string)=>readFileSync(join(process.cwd(),path),"utf8");
const visibleFiles=[
 "src/app/layout.tsx","src/app/page.tsx","src/app/login/page.tsx",
 "src/app/register/page.tsx","src/app/demo/page.tsx",
 "src/app/features/page.tsx","src/app/faq/page.tsx",
 "src/app/pricing/page.tsx","src/app/strategies/page.tsx",
 "src/app/tools/rebalance-calculator/page.tsx",
 "src/app/admin/layout.tsx","src/app/admin/seo/page.tsx",
 "src/components/AppShell.tsx"
];
describe("Rebalune brand migration",()=>{
 it("uses Rebalune throughout product UI rather than former brand",()=>{
  for(const path of visibleFiles){
   const content=read(path);
   expect(content,path).toContain("Rebalune");
   expect(content,path).not.toContain("StrategyOS");
  }
 });
 it("uses Rebalune as the default production brand",()=>{
  expect(read(".env.example")).toContain("NEXT_PUBLIC_BRAND_NAME=Rebalune");
  expect(read("src/app/layout.tsx")).toContain('||"Rebalune"');
 });
 it("preserves previous theme setting while writing only the new key",()=>{
  expect(read("src/app/layout.tsx")).toContain('localStorage.getItem("strategyos-theme")');
  expect(read("src/app/layout.tsx")).toContain('localStorage.getItem("rebalune-theme")');
  expect(read("src/components/ThemeToggle.tsx")).toContain('localStorage.setItem("rebalune-theme", next)');
 });
});
