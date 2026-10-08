import {describe,expect,it} from "vitest";
import {buildSecurityNotice} from "@/domain/security-notice";

describe("buildSecurityNotice",()=>{
 it("names the change and tells the owner what to do if it was not them",()=>{
  for(const kind of ["PASSWORD_CHANGED","MFA_ENABLED","MFA_DISABLED","SIGN_IN_METHOD_ADDED"] as const){
   const m=buildSecurityNotice(kind,"Rebalune");
   expect(m.subject.startsWith("Rebalune: ")).toBe(true);
   expect(m.text).toMatch(/If it was not you, reset your password/);
   expect(m.text).not.toMatch(/https?:\/\//);
  }
 });
 it("keeps the detail on one short line",()=>{
  const m=buildSecurityNotice("SIGN_IN_METHOD_ADDED","Rebalune","google\nBcc: x@evil.test"+"y".repeat(200));
  expect(m.text).toContain("Detail: google Bcc: x@evil.test");
  expect(m.text.split("\n").find((l)=>l.startsWith("Detail:"))!.length).toBeLessThanOrEqual(90);
 });
});
