import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

const expected:Record<string,Record<string,string>>={
  "mobile-chromium":{
    landing:"33a25e654b5fa2a2c59312f99fe4604a528c771a3df036413b50800002f41724",
    demo:"cbc28b2976d87728e977c18fe3a8fca79138c25de4b69c6e05e636a190d24c9f"
  },
  "desktop-chromium":{
    landing:"56f8622d3cbaa29ea3d7c348dfce9296da5fbf482025b82de2c884bba027ff09",
    demo:"556f4a545cd458a397e400a6f5106ce3b1aea543a3756093e46cd92080f7c0d1"
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
      await page.waitForTimeout(750);
    }
    const screenshot=await page.screenshot({fullPage:true,animations:"disabled",caret:"hide",scale:"css"});
    const digest=createHash("sha256").update(rgbPixels(screenshot)).digest("hex");
    const baseline=expected[testInfo.project.name]?.[entry.name];
    expect(baseline,"Missing visual baseline for "+testInfo.project.name+" / "+entry.name).toBeTruthy();
    if(digest!==baseline)await testInfo.attach(entry.name+"-actual.png",{body:screenshot,contentType:"image/png"});
    expect(digest).toBe(baseline);
  });
}
