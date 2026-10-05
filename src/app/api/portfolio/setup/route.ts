import { z } from "zod";
import { sql } from "@/lib/db";
import { signalOnOrBefore, todayIso } from "@/lib/dates";
import { getQuoteSafe } from "@/lib/market";
import { requireUser } from "@/lib/request-user";

const schema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startingCapital: z.coerce.number().positive(),
  monthlyContribution: z.coerce.number().nonnegative(),
  growthValue: z.coerce.number().nonnegative().optional(),
  reserveValue: z.coerce.number().nonnegative().optional(),
  growthPrice: z.coerce.number().positive().optional(),
  reservePrice: z.coerce.number().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const { portfolio } = await requireUser();
    const data = schema.parse(await request.json());
    if (data.startDate > todayIso()) return Response.json({ error: "Start date cannot be in the future." }, { status: 400 });

    const [gq, rq] = await Promise.all([getQuoteSafe(portfolio.growthSymbol), getQuoteSafe(portfolio.reserveSymbol)]);
    const growthPrice = data.growthPrice ?? gq?.price;
    const reservePrice = data.reservePrice ?? rq?.price;
    if (!growthPrice || !reservePrice) return Response.json({ error: "Confirm both 3QQQ and CSH2 prices to finish setup." }, { status: 400 });

    const growthValue = data.growthValue ?? data.startingCapital * portfolio.growthStartRatio;
    const reserveValue = data.reserveValue ?? Math.max(0, data.startingCapital - growthValue);
    const growthUnits = growthValue / growthPrice;
    const reserveUnits = reserveValue / reservePrice;
    const lastSignal = signalOnOrBefore(data.startDate, portfolio.signalAnchor);

    await sql.begin(async (tx) => {
      await tx`
        UPDATE portfolios SET setup_complete = true, start_date = ${data.startDate},
          starting_capital = ${data.startingCapital}, monthly_contribution = ${data.monthlyContribution},
          current_signal_base = ${growthValue}, signal_reference_price = ${growthPrice},
          last_signal_at = ${lastSignal}, manual_growth_price = NULL, manual_reserve_price = NULL,
          updated_at = now()
        WHERE id = ${portfolio.id}
      `;
      await tx`
        INSERT INTO reconciliations (portfolio_id, occurred_at, growth_units, reserve_units, growth_value, reserve_value, total_value, note)
        VALUES (${portfolio.id}, ${data.startDate}, ${growthUnits}, ${reserveUnits}, ${growthValue}, ${reserveValue}, ${growthValue + reserveValue}, 'Initial setup')
      `;
      await tx`
        INSERT INTO transactions (portfolio_id, occurred_at, event_type, action, growth_price, reserve_price, note)
        VALUES (${portfolio.id}, ${data.startDate}, 'SETUP', 'START_60_40', ${growthPrice}, ${reservePrice}, '9Sig journey started')
      `;
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Check the setup values." }, { status: 400 });
    return Response.json({ error: "Could not save setup." }, { status: 500 });
  }
}