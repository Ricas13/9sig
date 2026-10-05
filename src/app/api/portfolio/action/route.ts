import { z } from "zod";
import { sql } from "@/lib/db";
import { todayIso } from "@/lib/dates";
import { requireUser } from "@/lib/request-user";
import { buildStrategyState } from "@/lib/strategy";

const schema = z.object({
  growthPrice: z.coerce.number().positive().optional(),
  reservePrice: z.coerce.number().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const { portfolio } = await requireUser();
    const data = schema.parse(await request.json());
    const state = await buildStrategyState(portfolio, data);
    if (!["BUY","SELL","HOLD","SKIP_SELL","RESET","SPIKE_RESET"].includes(state.action)) {
      return Response.json({ error: "There is no signal action to complete right now." }, { status: 400 });
    }
    const growthPrice = data.growthPrice ?? state.growthPrice;
    const reservePrice = data.reservePrice ?? state.reservePrice;
    if (!growthPrice || !reservePrice) return Response.json({ error: "Confirm both execution prices." }, { status: 400 });

    let growthUnitsDelta = 0;
    let reserveUnitsDelta = 0;
    const amount = state.actionAmount;
    if (amount > 0) {
      growthUnitsDelta = amount / growthPrice;
      reserveUnitsDelta = -amount / reservePrice;
    } else if (amount < 0) {
      const abs = Math.abs(amount);
      growthUnitsDelta = -abs / growthPrice;
      reserveUnitsDelta = abs / reservePrice;
    }

    const signalDate = state.signalDue ? state.nextSignalDate : todayIso();
    const targetBase = state.action === "RESET" || state.action === "SPIKE_RESET"
      ? state.totalValue * portfolio.growthStartRatio
      : (state.nextTarget ?? portfolio.currentSignalBase ?? state.growthValue);

    let active = state.thirtyDownActive;
    let skipped = portfolio.thirtyDownSkippedSells;
    let started = portfolio.thirtyDownStartedAt;
    if (state.thirtyDownTriggeredNow && !portfolio.thirtyDownActive) started = state.nextSignalDate;
    if (state.action === "SKIP_SELL") skipped += 1;
    if (state.action === "RESET" || state.action === "SPIKE_RESET") { active = false; skipped = 0; started = null; }

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO transactions (
          portfolio_id, occurred_at, event_type, action, growth_units_delta, reserve_units_delta,
          growth_price, reserve_price, signal_target, note, metadata
        ) VALUES (
          ${portfolio.id}, ${todayIso()}, ${state.action === "SPIKE_RESET" ? "SPIKE_RESET" : "SIGNAL"}, ${state.action},
          ${growthUnitsDelta}, ${reserveUnitsDelta}, ${growthPrice}, ${reservePrice}, ${state.nextTarget},
          ${state.instruction}, ${JSON.stringify({ plannedSignalDate: state.nextSignalDate, thirtyDown: state.thirtyDownActive })}::jsonb
        )
      `;
      await tx`
        UPDATE portfolios SET current_signal_base = ${targetBase}, signal_reference_price = ${growthPrice},
          last_signal_at = ${state.signalDue ? signalDate : portfolio.lastSignalAt}, thirty_down_active = ${active},
          thirty_down_skipped_sells = ${skipped}, thirty_down_started_at = ${started},
          manual_growth_price = NULL, manual_reserve_price = NULL, updated_at = now()
        WHERE id = ${portfolio.id}
      `;
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Check the execution prices." }, { status: 400 });
    return Response.json({ error: "Could not complete the signal." }, { status: 500 });
  }
}
