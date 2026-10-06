import Decimal from "decimal.js";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { sql } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";

const schema = z.object({
  amount: z.string().regex(/^\d+(?:\.\d{1,8})?$/),
  occurredAt: z.string().datetime({ offset: true }).optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const strategy = await getStrategyForUser(user.id, id);
    if (!strategy) return Response.json({ error: "Not found." }, { status: 404 });

    const input = schema.parse(await request.json());
    const amount = new Decimal(input.amount);
    if (!amount.isFinite() || amount.lte(0)) {
      return Response.json({ error: "Enter a positive contribution." }, { status: 400 });
    }

    await sql.unsafe(
      "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,provenance,confidence) VALUES ($1,$2,'CONTRIBUTION',$3,$4,'USER_ENTERED','VERIFIED')",
      [id, input.occurredAt ? new Date(input.occurredAt) : new Date(), strategy.currency, amount.toString()]
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Enter a valid contribution and timestamp." }, { status: 400 });
    }
    return Response.json({ error: "Could not record contribution." }, { status: 500 });
  }
}
