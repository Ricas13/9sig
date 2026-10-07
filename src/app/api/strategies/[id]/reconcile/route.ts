import Decimal from "decimal.js";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { sql } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { calculateAction } from "@/lib/action-service";
import { summarizeReconciliationState } from "@/domain/reconciliation";

const money = z.string().regex(/^\d+(?:\.\d{1,8})?$/);
const schema = z.object({
  expectedValue: money,
  brokerValue: money,
  reason: z.string().max(120).optional(),
  affectsCash: z.boolean().default(false),
  accountId: z.string().uuid().optional(),
  requestKey: z.string().uuid().optional()
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

    const reconciliationState=await sql.begin(async (tx) => {
      const locked=await tx.unsafe(
        "SELECT i.id,i.status,a.id AS account_id,a.currency FROM strategy_instances i JOIN strategy_accounts sa ON sa.strategy_instance_id=i.id JOIN accounts a ON a.id=sa.account_id WHERE i.id=$1 AND i.user_id=$2 AND a.id=COALESCE($3::uuid,i.account_id) FOR UPDATE OF i",
        [id,user.id,input.accountId??null]
      );
      if(!locked[0])throw new Error("STRATEGY_NOT_FOUND");
      if(String(locked[0].status)==="CLOSED")throw new Error("STRATEGY_CLOSED");
      await tx.unsafe(
        "INSERT INTO reconciliations (strategy_instance_id,account_id,occurred_at,expected_value,broker_reported_value,difference,reason,provenance,metadata) VALUES ($1,$2,now(),$3,$4,$5,$6,'USER_CONFIRMED',$7::jsonb)",
        [id, locked[0].account_id, expected.toString(), broker.toString(), difference.toString(), input.reason ?? null, JSON.stringify({ affectsCash: input.affectsCash, resolved })]
      );

      if (!difference.eq(0) && input.affectsCash) {
        await tx.unsafe(
          "INSERT INTO ledger_events (strategy_instance_id,account_id,occurred_at,event_type,currency,cash_amount,provenance,confidence,metadata) VALUES ($1,$2,now(),'BROKER_ADJUSTMENT',$3,$4,'USER_CONFIRMED','VERIFIED',$5::jsonb)",
          [id, locked[0].account_id, String(locked[0].currency), difference.toString(), JSON.stringify({ reason: input.reason ?? "Cash adjustment", reconciliation: true })]
        );
      }

      const states = await tx.unsafe("SELECT state FROM strategy_states WHERE strategy_instance_id=$1 FOR UPDATE", [id]);
      const currentState = (states[0]?.state ?? {}) as Record<string, unknown>;
      const resumeBlocked = Boolean(currentState.resumeNeedsReconciliation);

      const latestRows=await tx.unsafe(
        "SELECT account_id,difference,reason,COALESCE((metadata->>'resolved')::boolean,false) AS resolved FROM ("+
        " SELECT DISTINCT ON (account_id) account_id,difference,reason,metadata,occurred_at,created_at"+
        " FROM reconciliations WHERE strategy_instance_id=$1"+
        " ORDER BY account_id,occurred_at DESC,created_at DESC"+
        ") latest",
        [id]
      );
      const summary=summarizeReconciliationState(
        latestRows.map((row)=>({
          accountId:row.account_id?String(row.account_id):null,
          difference:String(row.difference),
          reason:row.reason?String(row.reason):null,
          resolved:Boolean(row.resolved)
        })),
        resumeBlocked
      );

      if(summary.strategyResolved){
        await tx.unsafe(
          "UPDATE strategy_states SET state=state-'unresolvedReconciliation',confidence='HIGH',calculated_at=now() WHERE strategy_instance_id=$1",
          [id]
        );
      }else{
        await tx.unsafe(
          "UPDATE strategy_states SET state=jsonb_set(state,'{unresolvedReconciliation}',$1::jsonb,true),confidence='LOW',calculated_at=now() WHERE strategy_instance_id=$2",
          [JSON.stringify(summary.state),id]
        );
      }

      await tx.unsafe(
        "UPDATE strategy_instances SET last_reconciled_at=now(),health_status=$1,updated_at=now() WHERE id=$2",
        [summary.strategyResolved?"HEALTHY":"NEEDS_ATTENTION",id]
      );

      return {strategyResolved:summary.strategyResolved};
    });

    let actionId:string|null=null;
    if(String(strategy.status)==="ACTIVE"){try{actionId=(await calculateAction(id)).actionId;}catch{}}
    return Response.json({ ok: true, difference: difference.toString(), resolved, strategyResolved:reconciliationState.strategyResolved, actionId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Enter valid monetary amounts with up to 8 decimal places." }, { status: 400 });
    }
    const code=error instanceof Error?error.message:"FAILED";
    if(code==="STRATEGY_CLOSED")return Response.json({error:"Closed strategies are read-only."},{status:409});
    if(code==="STRATEGY_NOT_FOUND")return Response.json({error:"That account is not linked to this strategy."},{status:404});
    return Response.json({ error: "Could not reconcile strategy." }, { status: 500 });
  }
}
