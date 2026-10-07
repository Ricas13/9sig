import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

describe("Stripe webhook financial safety",()=>{
  const source=readFileSync(new URL("../src/app/api/stripe/webhook/route.ts",import.meta.url),"utf8");

  it("does not mark a concurrently-processing webhook failed",()=>{
    const catchStart=source.lastIndexOf("}catch(error){");
    const catchBlock=source.slice(catchStart);
    const guard=catchBlock.indexOf('code==="WEBHOOK_ALREADY_PROCESSING"');
    const failed=catchBlock.indexOf('markWebhookEvent(event.id,"FAILED"');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(failed).toBeGreaterThan(guard);
  });

  it("resolves subscription ownership from canonical local records when metadata is missing",()=>{
    expect(source).toContain("resolveSubscriptionUserId");
    expect(source).toContain("stripe_subscription_id=$1 LIMIT 2");
    expect(source).toContain("stripe_customer_id=$1 LIMIT 2");
    expect(source).toContain("AMBIGUOUS_SUBSCRIPTION_OWNER");
  });

  it("can resolve an exact configured Stripe price even after that price is no longer offered for new checkout",()=>{
    const resolveStart=source.indexOf("async function resolvePlanId");
    const resolveEnd=source.indexOf("async function resolveSubscriptionUserId",resolveStart);
    const block=source.slice(resolveStart,resolveEnd);
    expect(block).toContain("pp.stripe_price_id=$1");
    expect(block).not.toContain("pp.active=true");
    expect(block).toContain("AMBIGUOUS_STRIPE_PRICE");
  });
});
