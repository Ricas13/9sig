import { isNativeApp } from "@/domain/native-app";

export type StorePlatform = "ios" | "android";

export function platformFromUserAgent(userAgent: string | null | undefined): StorePlatform | null {
  if (!isNativeApp(userAgent)) return null;
  const ua = userAgent ?? "";
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return null;
}

export const manageSubscriptionUrl = (platform: StorePlatform) =>
  platform === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions";

export const storeName = (source: string) => (source === "APPLE" ? "App Store" : source === "GOOGLE" ? "Google Play" : "website");

export type StoreProduct = { productId: string; planSlug: string; planName: string; cadence: "MONTHLY" | "ANNUAL" };

/** Plans a user may buy in this platform's store, from the operator's product mapping. */
export function productsForPlatform(
  rows: Array<{ slug: string; display_name: string; cadence: string; apple_product_id: string | null; google_product_id: string | null }>,
  platform: StorePlatform
): StoreProduct[] {
  const out: StoreProduct[] = [];
  for (const row of rows) {
    const productId = platform === "ios" ? row.apple_product_id : row.google_product_id;
    if (!productId) continue;
    out.push({ productId, planSlug: row.slug, planName: row.display_name, cadence: row.cadence === "ANNUAL" ? "ANNUAL" : "MONTHLY" });
  }
  return out;
}
