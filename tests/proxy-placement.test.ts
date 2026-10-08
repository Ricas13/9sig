import { describe,expect,it } from "vitest";
import { existsSync,readFileSync } from "node:fs";

// Next.js only loads the proxy from src/ when the app lives in src/app. A root-level copy is
// ignored without any warning, which left the "route gate" dead until this was checked.
describe("route gate",()=>{
  const root=(path:string)=>new URL("../"+path,import.meta.url);

  it("lives where Next.js loads it, and not in a location where it would be ignored",()=>{
    expect(existsSync(root("src/app/layout.tsx"))).toBe(true);
    expect(existsSync(root("src/proxy.ts"))).toBe(true);
    expect(existsSync(root("proxy.ts"))).toBe(false);
  });

  it("protects only the signed-in areas so public and SEO pages can never be redirected",()=>{
    const source=readFileSync(root("src/proxy.ts"),"utf8");
    const matcher=/matcher:\s*\[([^\]]*)\]/.exec(source)?.[1] ?? "";
    expect(matcher).toContain("/app/:path*");
    expect(matcher).toContain("/admin/:path*");
    for(const publicPath of ["pricing","features","faq","strategies","robots","sitemap","login","demo","api"])expect(matcher).not.toContain(publicPath);
  });

  it("exports a real function, not the promise Auth.js returns when its configuration is built per request",()=>{
    const source=readFileSync(root("src/proxy.ts"),"utf8");
    expect(source).toMatch(/export async function proxy\(/);
    expect(source).not.toMatch(/export const proxy\s*=\s*auth\(/);
  });
});
