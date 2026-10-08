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
describe("Wealtharr brand migration",()=>{
 it("uses Wealtharr throughout product UI rather than former brand",()=>{
  for(const path of visibleFiles){
   const content=read(path);
   expect(content,path).toContain("Wealtharr");
   expect(content,path).not.toContain("Rebalune");
   expect(content,path).not.toContain("StrategyOS");
  }
 });
 it("uses Wealtharr as the default production brand",()=>{
  expect(read(".env.example")).toContain("NEXT_PUBLIC_BRAND_NAME=Wealtharr");
  expect(read("src/app/layout.tsx")).toContain('||"Wealtharr"');
  expect(read("src/lib/settings.ts")).toContain('value === "Rebalune" ? "Wealtharr"');
 });
 it("preserves previous theme setting while writing only the new key",()=>{
  expect(read("src/app/layout.tsx")).toContain('localStorage.getItem("strategyos-theme")');
  expect(read("src/app/layout.tsx")).toContain('localStorage.getItem("wealtharr-theme")');
  expect(read("src/app/layout.tsx")).toContain('localStorage.getItem("rebalune-theme")');
  expect(read("src/components/ThemeToggle.tsx")).toContain('localStorage.setItem("wealtharr-theme", next)');
 });
});

import {readdirSync,statSync} from "node:fs";
describe("former brand name",()=>{
 it("does not appear in any customer-facing source file",()=>{
  const walk=(dir:string):string[]=>readdirSync(join(process.cwd(),dir)).flatMap((name)=>{
   const rel=dir+"/"+name;
   return statSync(join(process.cwd(),rel)).isDirectory()?walk(rel):[rel];
  });
  const offenders=walk("src").filter((f)=>/\.(tsx?|css)$/.test(f)).filter((f)=>{
   // The legacy theme storage key is read on purpose so existing users keep their theme.
   // Explicit old-value compatibility is allowed only for the saved setting and native-app marker.
   const text=read(f).replace(/strategyos-theme/g,"").replace(/RebaluneApp/g,"");
   const checked=f==="src/lib/settings.ts"?text.replace('value === "Rebalune" ? "Wealtharr"',""):text;
   return checked.includes("StrategyOS") || /\bRebalune\b/.test(checked);
  });
  expect(offenders).toEqual([]);
 });
});
