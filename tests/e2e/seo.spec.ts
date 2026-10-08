import {test,expect} from "@playwright/test";

for(const [path,heading] of [
 ["/features","Track the rules. See the numbers. Know the next review."],
 ["/strategies","One portfolio workspace. Different rules."],
 ["/pricing","Start simple. Add strategies as you need them."],
 ["/faq","Frequently asked questions"]
] as const){
 test("public SEO page "+path+" renders a canonical heading and metadata",async({page})=>{
  await page.goto(path);
  await expect(page.getByRole("heading",{level:1,name:heading})).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content",/.{50,}/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href",new RegExp(path+"$"));
 });
}
test("staging never accidentally exposes indexing",async({request})=>{
 const robots=await request.get("/robots.txt");
 expect(robots.ok()).toBe(true);
 expect(await robots.text()).toMatch(/Disallow:\s*\//i);
 const sitemap=await request.get("/sitemap.xml");
 expect(sitemap.ok()).toBe(true);
 expect(await sitemap.text()).not.toContain("/admin");
});
test("protected routes send noindex header",async({request})=>{
 const res=await request.get("/login",{maxRedirects:0});
 expect(res.headers()["x-robots-tag"]).toContain("noindex");
});
