import Decimal from "decimal.js";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { sql } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { calculateAction } from "@/lib/action-service";

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
    if (String(strategy.status) === "CLOSED") return Response.json({ error: "Closed strategies are read-only." }, { status: 409 });

    const input = schema.parse(await request.json());
    const expected = new Decimal(input.expectedValue);
    const broker = new Decimal(input.brokerValue);
    const difference = broker.minus(expected);
    const resolved = difference.eq(0) || input.affectsCash;

    await sql.begin(async (tx) => {
      const locked=await tx.unsafe("SELECT id,status FROM strategy_instances WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,user.id]);
      if(!locked[0])throw new Error("STRATEGY_NOT_FOUND");
      if(String(locked[0].status)==="CLOSED")throw new Error("STRATEGY_CLOSED");
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
    });

    let actionId:string|null=null;
    if(String(strategy.status)==="ACTIVE"){try{actionId=(await calculateAction(id)).actionId;}catch{}}
    return Response.json({ ok: true, difference: difference.toString(), resolved, actionId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Enter valid monetary amounts with up to 8 decimal places." }, { status: 400 });
    }
    const code=error instanceof Error?error.message:"FAILED";
    if(code==="STRATEGY_CLOSED")return Response.json({error:"Closed strategies are read-only."},{status:409});
    return Response.json({ error: "Could not reconcile strategy." }, { status: 500 });
  }
}
