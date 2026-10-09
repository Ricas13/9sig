// Decides, from a snapshot of recent facts, which operational problems exist right now. Pure so every
// rule is covered by unit tests; gathering the facts is the monitor's job.
export type WorkerFact = { latestStatus: string | null; latestStartedAt: Date | null; previousStatus: string | null; lastGoodAt: Date | null };

export type OpsSnapshot = {
  now: Date;
  activeStrategies: number;
  cron: WorkerFact;
  marketData: WorkerFact;
  marketDataExpected: boolean;
  backup: { lastSuccessAt: Date | null; expected: boolean };
  failedWebhooks24h: number;
  stuckWebhooks: number;
  deadLetters24h: number;
  oldPendingDeliveries: number;
  storeItemsToReview7d: number;
  duplicateRefunds7d: number;
};

export type OpsAlert = { key: string; severity: "critical" | "warning"; title: string; detail: string };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const age = (now: Date, then: Date | null) => (then ? now.getTime() - then.getTime() : Infinity);
const human = (ms: number) => (ms === Infinity ? "never" : ms >= 48 * HOUR ? `${Math.round(ms / (24 * HOUR))} days ago` : ms >= HOUR ? `${Math.round(ms / HOUR)} hours ago` : `${Math.max(1, Math.round(ms / MINUTE))} minutes ago`);
const bad = (status: string | null) => status === "FAILED" || status === "PARTIAL";

export function evaluateOps(s: OpsSnapshot): OpsAlert[] {
  const alerts: OpsAlert[] = [];

  if (s.activeStrategies > 0) {
    const sinceGood = age(s.now, s.cron.lastGoodAt);
    if (sinceGood > 150 * MINUTE) {
      alerts.push({ key: "cron-stale", severity: "critical", title: "The hourly job has stopped running",
        detail: `Last completed ${human(sinceGood)}. Strategies are not being recalculated and reminders are not going out. Check that the scheduler still calls /api/cron/actions.` });
    }
  }
  if (s.cron.latestStatus === "RUNNING" && age(s.now, s.cron.latestStartedAt) > 30 * MINUTE) {
    alerts.push({ key: "cron-stuck", severity: "warning", title: "The hourly job looks stuck", detail: `It started ${human(age(s.now, s.cron.latestStartedAt))} and has not finished.` });
  }
  if (s.cron.latestStatus === "FAILED" || (bad(s.cron.latestStatus) && bad(s.cron.previousStatus))) {
    alerts.push({ key: "cron-degraded", severity: "warning", title: "The hourly job is failing or only partly finishing",
      detail: `Latest result: ${s.cron.latestStatus}${s.cron.previousStatus ? `, previous: ${s.cron.previousStatus}` : ""}. See Admin > Integrations & jobs for details.` });
  }

  if (s.marketDataExpected && s.activeStrategies > 0) {
    const sinceGood = age(s.now, s.marketData.lastGoodAt);
    if (sinceGood > 6 * HOUR) {
      alerts.push({ key: "market-data-stale", severity: "critical", title: "Market prices are not updating",
        detail: `Last successful price refresh: ${human(sinceGood)}. Actions stop when prices go stale. Check the market data service and its token in Admin > Settings.` });
    } else if (s.marketData.latestStatus === "FAILED" || (bad(s.marketData.latestStatus) && bad(s.marketData.previousStatus))) {
      alerts.push({ key: "market-data-degraded", severity: "warning", title: "Some market prices could not be refreshed",
        detail: `Latest result: ${s.marketData.latestStatus}. Quotes may be rejected as implausible or the provider may be failing for some symbols.` });
    }
  }

  if (s.backup.expected) {
    const since = age(s.now, s.backup.lastSuccessAt);
    if (since > 36 * HOUR) {
      alerts.push({ key: "backup-stale", severity: "critical", title: "No successful backup in the last day and a half",
        detail: `Last backup reported: ${human(since)}. Check the backup container and the off-site repository.` });
    }
  }

  if (s.failedWebhooks24h > 0 || s.stuckWebhooks > 0) {
    alerts.push({ key: "billing-webhooks", severity: "critical", title: "Billing notifications are failing",
      detail: `${s.failedWebhooks24h} failed and ${s.stuckWebhooks} stuck Stripe event(s) in the last day. Paid plans may not be updating. Stripe retries automatically; if it persists, check Admin > Integrations & jobs.` });
  }
  if (s.deadLetters24h > 0) {
    alerts.push({ key: "notification-dead-letters", severity: "warning", title: "Notifications could not be delivered",
      detail: `${s.deadLetters24h} notification(s) gave up after repeated attempts in the last day. Check the email service.` });
  }
  if (s.oldPendingDeliveries > 0) {
    alerts.push({ key: "notification-backlog", severity: "warning", title: "Notifications are queued for too long",
      detail: `${s.oldPendingDeliveries} notification(s) have waited more than 3 hours.` });
  }
  if (s.storeItemsToReview7d > 0) {
    alerts.push({ key: "store-review", severity: "warning", title: "App Store / Google Play purchases need a person",
      detail: `${s.storeItemsToReview7d} purchase notification(s) in the last week could not be applied (for example a customer subscribed on both the website and a store, or a product is not mapped). See the audit log for billing.store-needs-review.` });
  }
  if (s.duplicateRefunds7d > 0) {
    alerts.push({ key: "duplicate-refunds", severity: "warning", title: "Duplicate subscriptions may need a refund",
      detail: `${s.duplicateRefunds7d} duplicate subscription(s) were cancelled in the last week. Cancelling does not refund a payment already taken; review them in Stripe.` });
  }
  return alerts;
}

export function buildAlertEmail(brand: string, alerts: OpsAlert[], resolved: Array<{ title: string }>) {
  const lines: string[] = [];
  if (alerts.length) {
    lines.push("Needs attention:", "");
    for (const a of alerts) lines.push(`- [${a.severity.toUpperCase()}] ${a.title}`, `  ${a.detail}`, "");
  }
  if (resolved.length) {
    lines.push("Back to normal:", "");
    for (const r of resolved) lines.push(`- ${r.title}`);
    lines.push("");
  }
  lines.push("Open the admin area for details. This message is sent once when a problem starts, repeated daily while it lasts, and once more when it clears.");
  const critical = alerts.some((a) => a.severity === "critical");
  const subject = alerts.length
    ? `${brand}: ${critical ? "ACTION NEEDED" : "attention"} - ${alerts.length === 1 ? alerts[0].title : alerts.length + " operational problems"}`
    : `${brand}: resolved - ${resolved.length === 1 ? resolved[0].title : resolved.length + " problems cleared"}`;
  return { subject, text: lines.join("\n") };
}
