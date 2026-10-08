import {describe,expect,it} from "vitest";
import {base32Decode,base32Encode,currentStep,generateRecoveryCodes,hashRecoveryCode,looksLikeRecoveryCode,otpauthUri,totpAt,verifyTotp} from "@/domain/totp";

// RFC 6238 appendix B: ASCII secret "12345678901234567890", SHA-1, 8 digits there; we use 6, which is
// the last six digits of the published values.
const RFC_SECRET=base32Encode(Buffer.from("12345678901234567890"));
describe("TOTP",()=>{
 it("matches the RFC 6238 reference vectors",()=>{
  const vectors:Array<[number,string]>=[[59,"287082"],[1111111109,"081804"],[1111111111,"050471"],[1234567890,"005924"],[2000000000,"279037"],[20000000000,"353130"]];
  for(const [seconds,code] of vectors)expect(totpAt(RFC_SECRET,Math.floor(seconds/30)),String(seconds)).toBe(code);
 });
 it("round-trips base32",()=>{
  const bytes=Buffer.from("hello world!!");
  expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  expect(()=>base32Decode("not*base32")).toThrow();
 });
 it("accepts the current code and one step of drift, nothing further",()=>{
  const now=new Date(1234567890*1000);
  const step=currentStep(now);
  expect(verifyTotp(RFC_SECRET,totpAt(RFC_SECRET,step),now)).toBe(step);
  expect(verifyTotp(RFC_SECRET,totpAt(RFC_SECRET,step-1),now)).toBe(step-1);
  expect(verifyTotp(RFC_SECRET,totpAt(RFC_SECRET,step+1),now)).toBe(step+1);
  expect(verifyTotp(RFC_SECRET,totpAt(RFC_SECRET,step-2),now)).toBeNull();
  expect(verifyTotp(RFC_SECRET,totpAt(RFC_SECRET,step+2),now)).toBeNull();
 });
 it("refuses a code from a step that was already used",()=>{
  const now=new Date(1234567890*1000);
  const step=currentStep(now);
  expect(verifyTotp(RFC_SECRET,totpAt(RFC_SECRET,step),now,step)).toBeNull();
  expect(verifyTotp(RFC_SECRET,totpAt(RFC_SECRET,step-1),now,step)).toBeNull();
 });
 it("rejects malformed input",()=>{
  const now=new Date(1234567890*1000);
  for(const bad of ["","12345","1234567","abcdef","00 59 24x"])expect(verifyTotp(RFC_SECRET,bad,now),bad).toBeNull();
  expect(verifyTotp(RFC_SECRET,"005 924",now)).toBe(currentStep(now));
 });
 it("builds an authenticator URI",()=>{
  const uri=otpauthUri("ABC234","a+b@example.test","Rebalune");
  expect(uri).toBe("otpauth://totp/Rebalune:a%2Bb%40example.test?secret=ABC234&issuer=Rebalune&algorithm=SHA1&digits=6&period=30");
 });
 it("makes distinct recovery codes whose hash ignores case and the dash",()=>{
  const codes=generateRecoveryCodes();
  expect(new Set(codes).size).toBe(10);
  for(const code of codes){
   expect(looksLikeRecoveryCode(code)).toBe(true);
   expect(hashRecoveryCode(code)).toBe(hashRecoveryCode(code.toLowerCase().replace("-","")));
  }
  expect(looksLikeRecoveryCode("123456")).toBe(false);
 });
});
