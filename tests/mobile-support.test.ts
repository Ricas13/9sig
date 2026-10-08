import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {NATIVE_APP_MARKER,isNativeApp,providersForClient,purchasesAllowedFor} from "@/domain/native-app";
import {buildAppSiteAssociation,buildAssetLinks} from "@/domain/app-links";
import {settingByKey,validateSetting} from "@/domain/settings-registry";

const IOS_UA="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "+NATIVE_APP_MARKER;
const SAFARI_UA="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("native app detection",()=>{
 it("recognises only the app shell's marker",()=>{
  expect(isNativeApp(IOS_UA)).toBe(true);
  expect(isNativeApp("Legacy shell RebaluneApp")).toBe(true);
  expect(purchasesAllowedFor("Legacy shell RebaluneApp")).toBe(false);
  for(const ua of [SAFARI_UA,"",null,undefined])expect(isNativeApp(ua)).toBe(false);
 });
 it("blocks purchases only inside the apps",()=>{
  expect(purchasesAllowedFor(IOS_UA)).toBe(false);
  expect(purchasesAllowedFor(SAFARI_UA)).toBe(true);
 });
 it("hides Google (blocked in embedded web views) but keeps the other providers in the apps",()=>{
  const all=[{id:"google",label:"Google"},{id:"apple",label:"Apple"}];
  expect(providersForClient(all,IOS_UA).map((p)=>p.id)).toEqual(["apple"]);
  expect(providersForClient(all,SAFARI_UA).map((p)=>p.id)).toEqual(["google","apple"]);
 });
 it("uses the same marker in the Capacitor config as in the server",()=>{
  expect(readFileSync("mobile/capacitor.config.ts","utf8")).toContain(`appendUserAgent: "${NATIVE_APP_MARKER}"`);
 });
});

describe("app link files",()=>{
 it("are absent until the identifiers are saved",()=>{
  expect(buildAssetLinks(undefined,undefined)).toBeNull();
  expect(buildAssetLinks("com.example.app","")).toBeNull();
  expect(buildAppSiteAssociation("ABCDE12345",undefined)).toBeNull();
 });
 it("build Android asset links with every fingerprint, upper-cased",()=>{
  const fp="aa:bb:"+"cc:".repeat(29)+"dd:ee";
  const out=buildAssetLinks(" com.example.app ",fp+" , "+fp.replace(/aa/,"11"))!;
  expect(out[0].target).toMatchObject({namespace:"android_app",package_name:"com.example.app"});
  expect(out[0].target.sha256_cert_fingerprints).toHaveLength(2);
  expect(out[0].target.sha256_cert_fingerprints[0]).toBe(fp.toUpperCase());
 });
 it("build the iOS association for the signed-in area only",()=>{
  const out=buildAppSiteAssociation("ABCDE12345","com.example.app")!;
  expect(out.applinks.details[0].appIDs).toEqual(["ABCDE12345.com.example.app"]);
  expect(out.applinks.details[0].components.map((c)=>c["/"])).toEqual(["/app","/app/*"]);
  expect(JSON.stringify(out)).not.toContain('"/"'+":"+'"/*"');
 });
});

describe("mobile app settings",()=>{
 it("validate identifiers so a typo cannot publish a broken association file",()=>{
  const v=(key:string,value:string)=>validateSetting(settingByKey(key)!,value).ok;
  expect(v("ANDROID_PACKAGE_NAME","com.example.wealtharr")).toBe(true);
  expect(v("ANDROID_PACKAGE_NAME","wealtharr")).toBe(false);
  expect(v("IOS_TEAM_ID","ABCDE12345")).toBe(true);
  expect(v("IOS_TEAM_ID","abcde12345")).toBe(false);
  expect(v("IOS_BUNDLE_ID","com.example.wealtharr")).toBe(true);
  const fp=Array.from({length:32},(_,i)=>i.toString(16).padStart(2,"0").toUpperCase()).join(":");
  expect(v("ANDROID_SHA256_CERT_FINGERPRINTS",fp)).toBe(true);
  expect(v("ANDROID_SHA256_CERT_FINGERPRINTS",fp+", "+fp)).toBe(true);
  expect(v("ANDROID_SHA256_CERT_FINGERPRINTS","AB:CD")).toBe(false);
 });
});

describe("service worker",()=>{
 const source=readFileSync("public/sw.js","utf8");
 it("only ever answers GET requests for its own origin",()=>{
  expect(source).toMatch(/request\.method !== "GET"\) return/);
  expect(source).toMatch(/url\.origin !== self\.location\.origin\) return/);
 });
 it("never caches pages or API responses: only hashed build assets and the offline screen",()=>{
  const puts=source.match(/cache\.put\(/g)??[];
  expect(puts).toHaveLength(1);
  expect(source).toContain('url.pathname.startsWith("/_next/static/")');
  expect(source).not.toMatch(/\/api\//);
  expect(source).not.toMatch(/addAll\(/);
  expect(source).toContain("fetch(request).catch(() => caches.match(OFFLINE_URL))");
 });
});

describe("page shell",()=>{
 it("opts into full-screen layout and declares the install manifest and icons",()=>{
  const layout=readFileSync("src/app/layout.tsx","utf8");
  expect(layout).toContain('viewportFit: "cover"');
  expect(layout).toContain('manifest:"/manifest.webmanifest"');
  expect(layout).toContain("/pwa-icon/180");
  expect(layout).toContain("appleWebApp");
 });
});
