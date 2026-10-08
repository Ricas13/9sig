import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// Reviewed 2026-10-08 against the rendered pages (Rebalune brand, accessible mobile menu, demo chart
// settled). Digests are those produced by CI's renderer (Playwright Chromium 153, ubuntu-latest) and
// were identical across both attempts of the run, so they are deterministic there. They will not
// match a different browser build: regenerate from CI's "Received" values after reviewing the diff.
const expected:Record<string,Record<string,string>>={
  "mobile-chromium":{
    landing:"f6c5e27bd990a9e66392c135c0270e5f557d06168ce4cca2aa53de4d883faa4e",
    demo:"98df88f7a9b407e830587114f5516d405098581ceabf7adcb7ab3f0a47ea9ced"
  },
  "desktop-chromium":{
    landing:"5a43da4367e98822b20fc1209af6cffe8282e4c2fe2a024f56bb540165bc40f9",
    demo:"23e2e025d27445a9c2df9d7a510e2542fe9bba75862ddc7a46eddc491bad6267"
  }
};

function paeth(a:number,b:number,c:number){
  const p=a+b-c;
  const pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
}

function rgbPixels(png:Buffer){
  const signature="89504e470d0a1a0a";
  if(png.subarray(0,8).toString("hex")!==signature)throw new Error("INVALID_PNG");
  let offset=8,width=0,height=0,bitDepth=0,colorType=0,interlace=0;
  const idat:Buffer[]=[];
  while(offset<png.length){
    const length=png.readUInt32BE(offset);
    const type=png.subarray(offset+4,offset+8).toString("ascii");
    const start=offset+8,end=start+length;
    if(type==="IHDR"){
      width=png.readUInt32BE(start);
      height=png.readUInt32BE(start+4);
      bitDepth=png[start+8];
      colorType=png[start+9];
      interlace=png[start+12];
    }else if(type==="IDAT")idat.push(png.subarray(start,end));
    offset=end+4;
    if(type==="IEND")break;
  }
  if(!width||!height||bitDepth!==8||colorType!==2||interlace!==0)throw new Error("UNSUPPORTED_PNG_FORMAT");
  const bytesPerPixel=3,stride=width*bytesPerPixel;
  const inflated=inflateSync(Buffer.concat(idat));
  const pixels=Buffer.alloc(height*stride);
  for(let y=0;y<height;y++){
    const sourceStart=y*(stride+1);
    const filter=inflated[sourceStart];
    const rowStart=y*stride;
    const priorStart=(y-1)*stride;
    for(let x=0;x<stride;x++){
      const raw=inflated[sourceStart+1+x];
      const a=x>=bytesPerPixel?pixels[rowStart+x-bytesPerPixel]:0;
      const b=y>0?pixels[priorStart+x]:0;
      const c=y>0&&x>=bytesPerPixel?pixels[priorStart+x-bytesPerPixel]:0;
      let value:number;
      if(filter===0)value=raw;
      else if(filter===1)value=(raw+a)&255;
      else if(filter===2)value=(raw+b)&255;
      else if(filter===3)value=(raw+Math.floor((a+b)/2))&255;
      else if(filter===4)value=(raw+paeth(a,b,c))&255;
      else throw new Error("UNSUPPORTED_PNG_FILTER");
      pixels[rowStart+x]=value;
    }
  }
  return pixels;
}

for(const entry of [
  {path:"/",name:"landing"},
  {path:"/demo",name:"demo"}
]){
  test(entry.name+" visual regression",async({page},testInfo)=>{
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.goto(entry.path);
    await expect(page.locator("body")).toBeVisible();
    await page.evaluate(async()=>{
      await document.fonts.ready;
      await new Promise<void>((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    });
    if(entry.name==="demo"){
      await expect(page.locator(".chart-wrap svg")).toBeVisible();
      // Capture only once the chart geometry has stopped changing (500 ms unchanged, up to 8 s).
      // A fixed sleep photographed whichever animation frame the runner happened to reach, which
      // made the mobile demo hash differ between attempts of the same commit.
      await page.evaluate(async()=>{
        const signature=()=>Array.from(document.querySelectorAll(".chart-wrap svg path,.chart-wrap svg circle,.chart-wrap svg rect"))
          .map((node)=>node.tagName+":"+(node.getAttribute("d")??node.getAttribute("cx")??node.getAttribute("width")??"")).join("|");
        let previous=signature();
        let unchangedFor=0;
        for(let waited=0;waited<8000&&unchangedFor<500;waited+=100){
          await new Promise<void>((resolve)=>setTimeout(resolve,100));
          const current=signature();
          unchangedFor=current===previous?unchangedFor+100:0;
          previous=current;
        }
      });
    }
    const screenshot=await page.screenshot({fullPage:true,animations:"disabled",caret:"hide",scale:"css"});
    const digest=createHash("sha256").update(rgbPixels(screenshot)).digest("hex");
    const baseline=expected[testInfo.project.name]?.[entry.name];
    expect(baseline,"Missing visual baseline for "+testInfo.project.name+" / "+entry.name).toBeTruthy();
    if(digest!==baseline)await testInfo.attach(entry.name+"-actual.png",{body:screenshot,contentType:"image/png"});
    expect(digest).toBe(baseline);
  });
}
