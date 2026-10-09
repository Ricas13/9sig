import {describe,expect,it} from "vitest";
import {effectOf,isUserId,parseStoreEvent,storeSource} from "@/domain/store-subscriptions";
import {manageSubscriptionUrl,platformFromUserAgent,productsForPlatform,storeName} from "@/domain/store-products";

const USER="7b2f0f3e-8a7a-4c1e-9a43-3a1d2f6f5a11";
const body=(over:Record<string,unknown>={})=>({api_version:"1.0",event:{id:"evt1",type:"RENEWAL",app_user_id:USER,product_id:"com.example.pro.monthly",store:"APP_STORE",environment:"PRODUCTION",original_transaction_id:"1000000123",expiration_at_ms:Date.UTC(2026,10,8),event_timestamp_ms:Date.UTC(2026,9,8),...over}});

describe("parseStoreEvent",()=>{
 it("reads the fields we use",()=>{
  const e=parseStoreEvent(body())!;
  expect(e).toMatchObject({id:"evt1",type:"RENEWAL",appUserId:USER,productId:"com.example.pro.monthly",store:"APP_STORE",environment:"PRODUCTION",originalTransactionId:"1000000123"});
  expect(e.expirationAt?.toISOString()).toBe("2026-11-08T00:00:00.000Z");
 });
 it("rejects bodies that are not events",()=>{
  for(const bad of [null,undefined,{},{event:null},{event:{}},{event:{id:"x",type:"RENEWAL"}},"text",42])expect(parseStoreEvent(bad),JSON.stringify(bad)).toBeNull();
 });
 it("ignores values of the wrong type instead of trusting them",()=>{
  const e=parseStoreEvent(body({expiration_at_ms:"soon",product_id:{x:1},original_transaction_id:5}))!;
  expect(e.expirationAt).toBeNull();
  expect(e.productId).toBeNull();
  expect(e.originalTransactionId).toBeNull();
 });
});

describe("effectOf",()=>{
 const effect=(over:Record<string,unknown>)=>effectOf(parseStoreEvent(body(over))!);
 it("activates on purchase, renewal, un-cancellation and product change",()=>{
  for(const type of ["INITIAL_PURCHASE","RENEWAL","UNCANCELLATION","SUBSCRIPTION_EXTENDED"])expect(effect({type})).toEqual({kind:"ACTIVATE",status:"ACTIVE",cancelAtPeriodEnd:false,productId:"com.example.pro.monthly"});
  expect(effect({type:"PRODUCT_CHANGE",new_product_id:"com.example.pro.yearly"})).toMatchObject({kind:"ACTIVATE",productId:"com.example.pro.yearly"});
  expect(effect({type:"INITIAL_PURCHASE",period_type:"TRIAL"})).toMatchObject({status:"TRIALING"});
 });
 it("keeps access to the period end after an ordinary cancellation, but not after a refund",()=>{
  expect(effect({type:"CANCELLATION",cancel_reason:"UNSUBSCRIBE"})).toMatchObject({kind:"ACTIVATE",cancelAtPeriodEnd:true});
  expect(effect({type:"CANCELLATION",cancel_reason:"CUSTOMER_SUPPORT"})).toEqual({kind:"END"});
 });
 it("marks a billing problem as past due and ends on expiry or pause",()=>{
  expect(effect({type:"BILLING_ISSUE"})).toMatchObject({kind:"ACTIVATE",status:"PAST_DUE"});
  expect(effect({type:"EXPIRATION"})).toEqual({kind:"END"});
  expect(effect({type:"SUBSCRIPTION_PAUSED"})).toEqual({kind:"END"});
 });
 it("leaves transfers for a person and ignores everything else",()=>{
  expect(effect({type:"TRANSFER"})).toMatchObject({kind:"IGNORE",reason:"TRANSFER_NEEDS_REVIEW"});
  for(const type of ["TEST","NON_RENEWING_PURCHASE","SOMETHING_NEW"])expect(effect({type}).kind,type).toBe("IGNORE");
  expect(effect({type:"RENEWAL",product_id:undefined})).toMatchObject({kind:"IGNORE",reason:"NO_PRODUCT"});
 });
});

describe("identifiers",()=>{
 it("accepts only real user ids, not RevenueCat anonymous ones",()=>{
  expect(isUserId(USER)).toBe(true);
  for(const bad of ["$RCAnonymousID:abc","","not-a-uuid",USER+"x"])expect(isUserId(bad),bad).toBe(false);
 });
 it("maps stores to sources",()=>{
  expect(storeSource("APP_STORE")).toBe("APPLE");
  expect(storeSource("PLAY_STORE")).toBe("GOOGLE");
  for(const other of ["STRIPE","RC_BILLING","AMAZON",""])expect(storeSource(other)).toBeNull();
 });
});

describe("store products",()=>{
 const rows=[
  {slug:"investor",display_name:"Investor",cadence:"MONTHLY",apple_product_id:"a.inv.m",google_product_id:null},
  {slug:"pro",display_name:"Pro",cadence:"ANNUAL",apple_product_id:"a.pro.y",google_product_id:"g_pro_y"}
 ];
 it("lists only products mapped for that platform",()=>{
  expect(productsForPlatform(rows,"ios").map((p)=>p.productId)).toEqual(["a.inv.m","a.pro.y"]);
  expect(productsForPlatform(rows,"android")).toEqual([{productId:"g_pro_y",planSlug:"pro",planName:"Pro",cadence:"ANNUAL"}]);
 });
 it("finds the platform from the app's user agent only",()=>{
  expect(platformFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) WealtharrApp")).toBe("ios");
  expect(platformFromUserAgent("Mozilla/5.0 (Linux; Android 14) WealtharrApp")).toBe("android");
  expect(platformFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1")).toBeNull();
  expect(platformFromUserAgent(null)).toBeNull();
 });
 it("points to the right place to manage a subscription",()=>{
  expect(manageSubscriptionUrl("ios")).toContain("apps.apple.com");
  expect(manageSubscriptionUrl("android")).toContain("play.google.com");
  expect(storeName("APPLE")).toBe("App Store");
  expect(storeName("GOOGLE")).toBe("Google Play");
 });
});
