import Decimal from "decimal.js";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { sql } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";

const money = z.string().regex(/^\d+(?:\.\d{1,8})?$/);
const schema = z.object({
  expectedValue: money,
  brokerValue: money,
  reason: z.string().max(120).optional(),
  affectsCash: z.boolean().default(false)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const strategy = await getStrategyForUser(user.id, id);
    if (!strategy) return Response.json({ error: "Not found." }, { status: 404 });

    const input = schema.parse(await request.json());
    const expected = new Decimal(input.expectedValue);
    const broker = new Decimal(input.brokerValue);
    const difference = broker.minus(expected);
    const resolved = difference.eq(0) || input.affectsCash;
    const previousReconciledAt = strategy.last_reconciled_at ? new Date(strategy.last_reconciled_at) : null;

    const reconciledActionIds = await sql.begin(async (tx) => {
      const instanceRows = await tx.unsafe(
        "SELECT id FROM strategy_instances WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [id, user.id]
      );
      if (!instanceRows[0]) throw new Error("STRATEGY_NOT_FOUND");

      await tx.unsafe(
        "INSERT INTO reconciliations (strategy_instance_id,occurred_at,expected_value,broker_reported_value,difference,reason,provenance,metadata) VALUES ($1,now(),$2,$3,$4,$5,'USER_CONFIRMED',$6::jsonb)",
        [id, expected.toString(), broker.toString(), difference.toString(), input.reason ?? null, JSON.stringify({ affectsCash: input.affectsCash, resolved })]
      );

      if (!difference.eq(0) && input.affectsCash) {
        await tx.unsafe(
          "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,provenance,confidence,metadata) VALUES ($1,now(),'BROKER_ADJUSTMENT',$2,$3,'USER_CONFIRMED','VERIFIED',$4::jsonb)",
          [id, strategy.currency, difference.toString(), JSON.stringify({ reason: input.reason ?? "Cash adjustment", reconciliation: true })]
        );
      }

      const states = await tx.unsafe("SELECT state FROM strategy_states WHERE strategy_instance_id=$1 FOR UPDATE", [id]);
      const currentState = (states[0]?.state ?? {}) as Record<string, unknown>;
      const resumeBlocked = Boolean(currentState.resumeNeedsReconciliation);

      if (resolved) {
        await tx.unsafe(
          "UPDATE strategy_states SET state=state-'unresolvedReconciliation',confidence=$1,calculated_at=now() WHERE strategy_instance_id=$2",
          [resumeBlocked ? "LOW" : "HIGH", id]
        );
      } else {
        await tx.unsafe(
          "UPDATE strategy_states SET state=jsonb_set(state,'{unresolvedReconciliation}',$1::jsonb,true),confidence='LOW',calculated_at=now() WHERE strategy_instance_id=$2",
          [JSON.stringify({ difference: difference.toString(), reason: input.reason ?? "Unknown adjustment" }), id]
        );
      }

      await tx.unsafe(
        "UPDATE strategy_instances SET last_reconciled_at=now(),health_status=$1,updated_at=now() WHERE id=$2",
        [resolved && !resumeBlocked ? "HEALTHY" : "NEEDS_ATTENTION", id]
      );

      if (!resolved) return [] as string[];

      const reconciled = await tx.unsafe(
        "UPDATE actions SET status='RECONCILED',reconciled_at=now(),updated_at=now() WHERE strategy_instance_id=$1 AND status='EXECUTED' AND ($2::timestamptz IS NULL OR executed_at>$2) RETURNING id,title",
        [id, previousReconciledAt]
      );
      for (const action of reconciled) {
        await tx.unsafe(
          "INSERT INTO notifications (user_id,action_id,type,title,body) VALUES ($1,$2,'ACTION_RECONCILED',$3,$4) ON CONFLICT DO NOTHING",
          [user.id, action.id, "Action reconciled to broker", String(action.title)]
        );
      }
      return reconciled.map((action) => String(action.id));
    });

    return Response.json({
      ok: true,
      difference: difference.toString(),
      resolved,
      reconciledActions: reconciledActionIds.length
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Enter valid monetary amounts with up to 8 decimal places." }, { status: 400 });
    }
    return Response.json({ error: "Could not reconcile strategy." }, { status: 500 });
  }
}
