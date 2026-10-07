import { expect, test } from "@playwright/test";

for (const entry of [
  { path: "/", name: "landing" },
  { path: "/demo", name: "demo" }
]) {
  test(entry.name + " visual regression", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(entry.path);
    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveScreenshot(entry.name + ".png", {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.002
    });
  });
}
