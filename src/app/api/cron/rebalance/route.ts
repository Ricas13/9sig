import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { sendDiscord } from "@/lib/discord";
import { getPortfolio } from "@/lib/portfolio";
import { buildStrategyState } from "@/lib/strategy";
import { todayIso } from "@/lib/dates";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });

  const rows = await sql`
    SELECT id, discord_webhook_ciphertext FROM users
    WHERE discord_webhook_ciphertext IS NOT NULL
      AND (subscription_status IN ('active','trialing') OR lower(email)=lower(${process.env.OWNER_EMAIL ?? ""}))
  `;
  let sent = 0;
  for (const row of rows) {
    try {
      const portfolio = await getPortfolio(row.id as string);
      if (!portfolio.setupComplete) continue;
      const state = await buildStrategyState(portfolio);
      if (!state.signalDue) continue;
      const key = `signal:${state.nextSignalDate}`;
      const [existing] = await sql`SELECT id FROM notification_events WHERE user_id=${row.id} AND event_key=${key} LIMIT 1`;
      if (existing) continue;
      const pendingContribution = state.action === "ADD_CONTRIBUTION";
      const content = pendingContribution
        ? `**9Sig signal day**\nA monthly contribution is still pending. Log it first so the 9Sig target is correct, then reopen the dashboard.\n${process.env.NEXT_PUBLIC_APP_URL ?? ""}`
        : `**9Sig signal today**\n**${state.headline}**\n${state.instruction}\nTarget: £${(state.nextTarget ?? 0).toFixed(2)}\n3QQQ value: £${state.growthValue.toFixed(2)}\n${process.env.NEXT_PUBLIC_APP_URL ?? ""}`;
      await sendDiscord(decryptSecret(row.discord_webhook_ciphertext as string), content);
      await sql`INSERT INTO notification_events (user_id,event_key) VALUES (${row.id},${key})`;
      sent += 1;
    } catch { /* fail one user without blocking other alerts */ }
  }
  return Response.json({ ok: true, date: todayIso(), sent });
}