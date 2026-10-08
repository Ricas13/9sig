import {describe,it,expect} from "vitest";
import {absolutePublicUrl,siteOrigin,publicIndexingEnabled,safeJsonLd,publicSeoRoutes,privateRoutePrefixes} from "../src/lib/public-seo";
describe("public search indexing",()=>{
 it("never indexes staging, HTTP or unapproved prod",()=>{
  expect(publicIndexingEnabled({NODE_ENV:"development",PUBLIC_INDEXING_ENABLED:"true",NEXT_PUBLIC_APP_URL:"https://example.com"})).toBe(false);
  expect(publicIndexingEnabled({NODE_ENV:"production",PUBLIC_INDEXING_ENABLED:"false",NEXT_PUBLIC_APP_URL:"https://example.com"})).toBe(false);
  expect(publicIndexingEnabled({NODE_ENV:"production",PUBLIC_INDEXING_ENABLED:"true",NEXT_PUBLIC_APP_URL:"http://example.com"})).toBe(false);
  expect(publicIndexingEnabled({NODE_ENV:"production",PUBLIC_INDEXING_ENABLED:"true",NEXT_PUBLIC_APP_URL:"https://example.com"})).toBe(true);
 });
 it("only permits canonical public URLs",()=>{
  expect(absolutePublicUrl("/faq","https://example.com")).toBe("https://example.com/faq");
  expect(()=>absolutePublicUrl("/admin","https://example.com")).toThrow("NOT_PUBLIC_SEO_ROUTE");
  expect(publicSeoRoutes.every(x=>!privateRoutePrefixes.some(privatePrefix=>x.startsWith(privatePrefix)))).toBe(true);
 });
 it("strips credentials query and fragments from origin",()=>{
  expect(siteOrigin("https://example.com/somewhere?test=yes#anchor").toString()).toBe("https://example.com/");
 });
 it("escapes unsafe script delimiters in structured data",()=>{
  expect(safeJsonLd({value:"</script><script>"})).not.toContain("</script>");
 });
});
