import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const expected:Record<string,Record<string,string>>={
  "mobile-chromium":{
    landing:"eb53da491d7c5e20be6725ae9132e57e2aba41c2be2555a1f2581a9a96ee649f",
    demo:"0f41aaef97ba547181721658b70c8cddb24fcf4d1ee8c7bb7c89c9a5970878b6"
  },
  "desktop-chromium":{
    landing:"ae18911e7c0c4f41b79f4d72c5e9d3021650900b577359b109f989d08d672e62",
    demo:"a4ec1f498a230ba258b8a02bf63f143b7fb057b3a3c53213cecd5ce2bd1ba421"
  }
};

for (const entry of [
  { path: "/", name: "landing" },
  { path: "/demo", name: "demo" }
]) {
  test(entry.name+" visual regression",async({page},testInfo)=>{
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.goto(entry.path);
    await expect(page.locator("body")).toBeVisible();
    const screenshot=await page.screenshot({
      fullPage:true,
      animations:"disabled",
      caret:"hide",
      scale:"css"
    });
    const digest=createHash("sha256").update(screenshot).digest("hex");
    const baseline=expected[testInfo.project.name]?.[entry.name];
    expect(baseline,"Missing visual baseline for "+testInfo.project.name+" / "+entry.name).toBeTruthy();
    if(digest!==baseline){
      await testInfo.attach(entry.name+"-actual.png",{body:screenshot,contentType:"image/png"});
    }
    expect(digest).toBe(baseline);
  });
}
