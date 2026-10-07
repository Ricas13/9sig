import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

describe("notification delivery entitlement safety",()=>{
  const source=readFileSync(new URL("../src/lib/notification-service.ts",import.meta.url),"utf8");

  it("rechecks the current plan before sending a queued paid-channel delivery",()=>{
    expect(source).toContain("await loadEntitlements(userId)");
    expect(source).toContain("channels.has(String(d.channel))");
    expect(source).toContain("CHANNEL_NOT_IN_PLAN");
    const entitlementCheck=source.indexOf("channels.has(String(d.channel))");
    const emailSend=source.indexOf('if(d.channel==="EMAIL")');
    expect(entitlementCheck).toBeGreaterThanOrEqual(0);
    expect(emailSend).toBeGreaterThan(entitlementCheck);
  });

  it("cancels rather than retries a delivery whose channel is no longer entitled",()=>{
    expect(source).toContain("status='CANCELLED'");
    expect(source).toContain("last_error_code='CHANNEL_NOT_IN_PLAN'");
  });
});
