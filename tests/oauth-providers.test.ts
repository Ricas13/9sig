import {describe,expect,it} from "vitest";
import {generateKeyPairSync} from "node:crypto";
import {decodeJwt,decodeProtectedHeader} from "jose";
import {appleConfigured,enabledOAuthProviders,profileEmailVerified} from "@/domain/oauth-providers";
import {createAppleClientSecret} from "@/lib/apple-client-secret";

describe("enabledOAuthProviders",()=>{
 it("shows nothing until a provider is fully configured",()=>{
  expect(enabledOAuthProviders({})).toEqual([]);
  expect(enabledOAuthProviders({AUTH_GOOGLE_ID:"id"})).toEqual([]);
  expect(enabledOAuthProviders({AUTH_GOOGLE_ID:" ",AUTH_GOOGLE_SECRET:"s"})).toEqual([]);
  expect(enabledOAuthProviders({AUTH_APPLE_ID:"com.example.web"})).toEqual([]);
 });
 it("lists configured providers in a stable order",()=>{
  expect(enabledOAuthProviders({AUTH_GOOGLE_ID:"id",AUTH_GOOGLE_SECRET:"s"})).toEqual([{id:"google",label:"Google"}]);
  expect(enabledOAuthProviders({AUTH_GOOGLE_ID:"id",AUTH_GOOGLE_SECRET:"s",AUTH_APPLE_ID:"a",AUTH_APPLE_SECRET:"jwt"}).map((p)=>p.id)).toEqual(["google","apple"]);
 });
 it("accepts Apple through a ready secret or through the key pieces, not half of them",()=>{
  expect(appleConfigured({AUTH_APPLE_ID:"a",AUTH_APPLE_SECRET:"jwt"})).toBe(true);
  expect(appleConfigured({AUTH_APPLE_ID:"a",AUTH_APPLE_TEAM_ID:"t",AUTH_APPLE_KEY_ID:"k",AUTH_APPLE_PRIVATE_KEY:"p"})).toBe(true);
  expect(appleConfigured({AUTH_APPLE_ID:"a",AUTH_APPLE_TEAM_ID:"t",AUTH_APPLE_KEY_ID:"k"})).toBe(false);
 });
});

describe("profileEmailVerified",()=>{
 it("trusts only an explicit true from a known provider",()=>{
  expect(profileEmailVerified("google",{email_verified:true})).toBe(true);
  expect(profileEmailVerified("apple",{email_verified:"true"})).toBe(true);
  for(const bad of [undefined,{},{email_verified:false},{email_verified:"false"},{email_verified:1},{email_verified:"yes"}])expect(profileEmailVerified("google",bad as never)).toBe(false);
  expect(profileEmailVerified("github",{email_verified:true})).toBe(false);
 });
});

describe("createAppleClientSecret",()=>{
 it("signs an ES256 token Apple will accept, valid for under six months",async()=>{
  const {privateKey}=generateKeyPairSync("ec",{namedCurve:"P-256"});
  const pem=privateKey.export({type:"pkcs8",format:"pem"}).toString();
  const now=new Date("2026-10-08T12:00:00Z");
  const token=await createAppleClientSecret({teamId:"TEAM123456",clientId:"com.example.web",keyId:"KEY1234567",privateKey:pem.replace(/\n/g,"\\n")},now);
  expect(decodeProtectedHeader(token)).toMatchObject({alg:"ES256",kid:"KEY1234567"});
  const claims=decodeJwt(token);
  expect(claims).toMatchObject({iss:"TEAM123456",sub:"com.example.web",aud:"https://appleid.apple.com"});
  const lifetimeDays=(Number(claims.exp)-Number(claims.iat))/86400;
  expect(lifetimeDays).toBeGreaterThan(100);
  expect(lifetimeDays).toBeLessThanOrEqual(180);
 });
});
