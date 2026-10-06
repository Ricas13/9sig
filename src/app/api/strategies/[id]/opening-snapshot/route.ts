import Decimal from "decimal.js";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { calculateAction } from "@/lib/action-service";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";

const decimalString = z.string().regex(/^\d+(?:\.\d{1,12})?$/);
const schema = z.object({
  cash: decimalString.default("0"),
  holdings: z.array(z.object({
    ticker: z.string().min(1).max(40),
    exchange: z.string().min(1).max(80),
    quantity: decimalString
  })).max(30).default([])
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const strategy = await getStrategyForUser(user.id, id);
    if (!strategy) return Response.json({ error: "Not found." }, { status: 404 });
    if (String(strategy.onboarding_mode) !== "RESUME") {
      return Response.json({ error: "Opening snapshots are only available for resumed strategies." }, { status: 409 });
    }

    const input = schema.parse(await request.json());
    const cash = new Decimal(input.cash);
    const holdings = input.holdings.map((h) => ({ ...h, quantityDecimal: new Decimal(h.quantity) }));
    if (cash.lt(0) || !cash.isFinite() || holdings.some((h) => !h.quantityDecimal.isFinite() || h.quantityDecimal.lte(0))) {
      return Response.json({ error: "Opening balances must be finite and non-negative." }, { status: 400 });
    }
    if (cash.eq(0) && holdings.length === 0) {
      return Response.json({ error: "Enter cash, at least one holding, or both." }, { status: 400 });
    }

    await sql.begin(async (tx) => {
      const locked = await tx.unsafe("SELECT id FROM strategy_instances WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, user.id]);
      if (!locked[0]) throw new Error("STRATEGY_NOT_FOUND");
      const existing = await tx.unsafe(
        "SELECT count(*)::int AS count FROM ledger_events WHERE strategy_instance_id=$1 AND event_type IN ('OPENING_CASH','OPENING_POSITION')",
        [id]
      );
      if (Number(existing[0]?.count ?? 0) > 0) throw new Error("OPENING_SNAPSHOT_EXISTS");

      if (cash.gt(0)) {
        await tx.unsafe(
          "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,provenance,confidence,metadata) VALUES ($1,now(),'OPENING_CASH',$2,$3,'USER_CONFIRMED','VERIFIED',$4::jsonb)",
          [id, strategy.currency, cash.toString(), JSON.stringify({ openingSnapshot: true })]
        );
      }

      for (const holding of holdings) {
        const lines = await tx.unsafe(
          "SELECT tl.instrument_id,tl.currency,tl.id FROM trading_lines tl WHERE upper(tl.ticker)=upper($1) AND upper(tl.exchange)=upper($2) AND tl.effective_from<=current_date AND (tl.effective_to IS NULL OR tl.effective_to>=current_date) LIMIT 1",
          [holding.ticker, holding.exchange]
        );
        if (!lines[0]) throw new Error("TRADING_LINE_NOT_FOUND:" + holding.ticker + ":" + holding.exchange);
        await tx.unsafe(
          "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,instrument_id,trading_line_id,quantity,provenance,confidence,metadata) VALUES ($1,now(),'OPENING_POSITION',$2,0,$3,$4,$5,'USER_CONFIRMED','VERIFIED',$6::jsonb)",
          [id, lines[0].currency, lines[0].instrument_id, lines[0].id, holding.quantityDecimal.toString(), JSON.stringify({ openingSnapshot: true, tradingLineId: String(lines[0].id), ticker: holding.ticker, exchange: holding.exchange })]
        );
      }

      await tx.unsafe(
        "UPDATE strategy_states SET state=(state-'resumeNeedsReconciliation') || $1::jsonb,confidence='MEDIUM',calculated_at=now() WHERE strategy_instance_id=$2",
        [JSON.stringify({ openingSnapshotAt: new Date().toISOString() }), id]
      );
      await tx.unsafe("UPDATE strategy_instances SET health_status='NEEDS_ATTENTION',updated_at=now() WHERE id=$1", [id]);
      await tx.unsafe(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'strategy.opening-snapshot','strategy_instance',$2,$3::jsonb)",
        [user.id, id, JSON.stringify({ holdings: holdings.length, cashEntered: cash.gt(0) })]
      );
    });

    let actionId: string | null = null;
    try {
      actionId = (await calculateAction(id)).actionId;
    } catch {
      // The snapshot is still valid even if market data is not ready; the dashboard remains NEEDS_ATTENTION.
    }
    return Response.json({ ok: true, actionId });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Check the opening cash and holding quantities." }, { status: 400 });
    const code = error instanceof Error ? error.message : "FAILED";
    if (code === "OPENING_SNAPSHOT_EXISTS") return Response.json({ error: "An opening snapshot already exists for this strategy." }, { status: 409 });
    if (code.startsWith("TRADING_LINE_NOT_FOUND:")) {
      const [, ticker, exchange] = code.split(":");
      return Response.json({ error: "No active configured trading line was found for " + ticker + " on " + exchange + "." }, { status: 400 });
    }
    return Response.json({ error: "Could not save the opening snapshot." }, { status: 500 });
  }
}
