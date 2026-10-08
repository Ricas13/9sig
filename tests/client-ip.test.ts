import {describe,expect,it} from "vitest";
import {clientIp} from "@/domain/client-ip";
import {safeNextPath} from "@/domain/safe-next";

describe("clientIp",()=>{
 it("ignores entries the caller forged ahead of the proxy-appended one",()=>{
  expect(clientIp("1.1.1.1, 9.9.9.9")).toBe("9.9.9.9");
  expect(clientIp("6.6.6.6, 7.7.7.7, 9.9.9.9")).toBe("9.9.9.9");
 });
 it("honours the number of trusted proxies",()=>{
  expect(clientIp("8.8.8.8, 9.9.9.9",2)).toBe("8.8.8.8");
  expect(clientIp("9.9.9.9",3)).toBe("9.9.9.9");
 });
 it("falls back safely",()=>{
  expect(clientIp(null)).toBe("unknown");
  expect(clientIp("")).toBe("unknown");
  expect(clientIp("1.1.1.1",0)).toBe("1.1.1.1");
 });
});

describe("safeNextPath",()=>{
 it("keeps in-app paths",()=>{
  expect(safeNextPath("/app")).toBe("/app");
  expect(safeNextPath("/app/strategies/abc?tab=history")).toBe("/app/strategies/abc?tab=history");
  expect(safeNextPath("/admin/operations")).toBe("/admin/operations");
 });
 it("rejects anything that could leave the site or the signed-in areas",()=>{
  for(const bad of ["//evil.test","/\\evil.test","https://evil.test","javascript:alert(1)","/login","/app//evil.test","/app/../x","/applesauce","",undefined,null,42,"/app\nSet-Cookie:x"]){
   expect(safeNextPath(bad),String(bad)).toBe("/app");
  }
 });
});
