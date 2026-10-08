import {describe,expect,it} from "vitest";
import {summarizeUserAgent} from "@/domain/device";

const CHROME_WIN="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CHROME_WIN_NEWER=CHROME_WIN.replace("126","131");
const EDGE_WIN=CHROME_WIN+" Edg/126.0.0.0";
const SAFARI_IOS="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const FIREFOX_LINUX="Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";

describe("summarizeUserAgent",()=>{
 it("names browser and operating system",()=>{
  expect(summarizeUserAgent(CHROME_WIN).label).toBe("Chrome on Windows");
  expect(summarizeUserAgent(EDGE_WIN).label).toBe("Edge on Windows");
  expect(summarizeUserAgent(SAFARI_IOS).label).toBe("Safari on iOS");
  expect(summarizeUserAgent(FIREFOX_LINUX).label).toBe("Firefox on Linux");
  expect(summarizeUserAgent(SAFARI_IOS+" WealtharrApp").label).toBe("the Wealtharr app on iOS");
  expect(summarizeUserAgent(SAFARI_IOS+" RebaluneApp").label).toBe("the Wealtharr app on iOS");
  expect(summarizeUserAgent(SAFARI_IOS+" RebaluneApp").key).toBe(summarizeUserAgent(SAFARI_IOS+" WealtharrApp").key);
 });
 it("does not treat a browser update as a new device, but does tell different browsers or systems apart",()=>{
  expect(summarizeUserAgent(CHROME_WIN).key).toBe(summarizeUserAgent(CHROME_WIN_NEWER).key);
  const keys=new Set([CHROME_WIN,EDGE_WIN,SAFARI_IOS,FIREFOX_LINUX,SAFARI_IOS+" WealtharrApp"].map((u)=>summarizeUserAgent(u).key));
  expect(keys.size).toBe(5);
 });
 it("copes with missing or odd agents without storing them",()=>{
  for(const ua of [null,undefined,"","curl/8.0"]){
   const d=summarizeUserAgent(ua);
   expect(d.label).toMatch(/unknown/);
   expect(d.key).toMatch(/^[0-9a-f]{32}$/);
  }
 });
});
