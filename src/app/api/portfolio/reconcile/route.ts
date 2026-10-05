import { z } from "zod";
import { sql } from "@/lib/db";
import { todayIso } from "@/lib/dates";
import { currentHoldings, currentPrices } from "@/lib/portfolio";
import { requireUser } from "@/lib/request-user";

const schema = z.object({
  growthUnits: z.coerce.number().nonnegative().optional(),
  reserveUnits: z.coerce.number().nonnegative().optional(),
  growthValue: z.coerce.number().nonnegative().optional(),
  reserveValue: z.coerce.number().nonnegative().optional(),
  totalValue: z.coerce.number().positive().optional(),
  growthPrice: z.coerce.number().positive().optional(),
  reservePrice: z.coerce.number().positive().optional(),
}).refine((x) => x.growthUnits != null || x.reserveUnits != null || x.growthValue != null || x.reserveValue != null || x.totalValue != null, "Enter at least one reconciliation value");

export async function POST(request: Request) {
  try {
    const { portfolio } = await requireUser();
    const data = schema.parse(await request.json());
    const today = todayIso();
    const tracked = await currentHoldings(portfolio, today);
    const auto = await currentPrices(portfolio);
    const growthPrice = data.growthPrice ?? auto.growth;
    const reservePrice = data.reservePrice ?? auto.reserve;
    if (!growthPrice || !reservePrice) return Response.json({ error: "Confirm both prices before reconciling." }, { status: 400 });

    const growthUnits = data.growthUnits ?? (data.growthValue != null ? data.growthValue / growthPrice : tracked.growthUnits);
    let reserveUnits = data.reserveUnits ?? (data.reserveValue != null ? data.reserveValue / reservePrice : tracked.reserveUnits);
    if (data.totalValue != null && data.reserveUnits == null && data.reserveValue == null) {
      reserveUnits = Math.max(0, data.totalValue - growthUnits * growthPrice) / reservePrice;
    }
    const growthValue = growthUnits * growthPrice;
    const reserveValue = reserveUnits * reservePrice;
    await sql`
      INSERT INTO reconciliations (portfolio_id, occurred_at, growth_units, reserve_units, growth_value, reserve_value, total_value, note)
      VALUES (${portfolio.id}, ${today}, ${growthUnits}, ${reserveUnits}, ${growthValue}, ${reserveValue}, ${growthValue + reserveValue}, 'Manual broker reconciliation')
    `;
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Enter valid reconciliation values." }, { status: 400 });
    return Response.json({ error: "Could not reconcile portfolio." }, { status: 500 });
  }
}