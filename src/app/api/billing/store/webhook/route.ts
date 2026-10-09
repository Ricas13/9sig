import crypto from "node:crypto";
import { ensureSettings } from "@/lib/settings";
import { applyStoreEvent } from "@/lib/store-billing";
import { parseStoreEvent } from "@/domain/store-subscriptions";

// RevenueCat notifies this endpoint when someone buys, renews, cancels or loses a subscription in
// the App Store or Google Play. Set the same value as "Authorization header" in RevenueCat and in
// Admin > Settings > Mobile app purchases.
function authorised(request: Request) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) return null;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected.replace(/^Bearer\s+/i, "")).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  await ensureSettings();
  const ok = authorised(request);
  if (ok === null) return Response.json({ error: "Store purchases are not configured." }, { status: 503 });
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid body" }, { status: 400 }); }
  const event = parseStoreEvent(body);
  if (!event) return Response.json({ ok: true, outcome: "IGNORED" });
  try {
    const result = await applyStoreEvent(event, { allowSandbox: process.env.STORE_ALLOW_SANDBOX === "true" });
    return Response.json({ ok: true, outcome: result.outcome });
  } catch {
    // Not acknowledged: RevenueCat retries, and the transaction left no trace.
    return Response.json({ error: "Could not process the event." }, { status: 500 });
  }
}
