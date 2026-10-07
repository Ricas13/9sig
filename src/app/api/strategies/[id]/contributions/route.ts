import Decimal from "decimal.js";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { sql } from "@/lib/db";
import { calculateAction } from "@/lib/action-service";
import { advanceContributionPlan, normalizeContributionPlan } from "@/domain/contribution-plan";
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

    if(String(strategy.status)==="CLOSED")return Response.json({error:"Closed strategies are read-only."},{status:409});

    const occurredAt=input.occurredAt ? new Date(input.occurredAt) : new Date();
    const result=await sql.begin(async(tx)=>{
      const locked=await tx.unsafe(
        "SELECT i.status,i.contribution_plan,a.currency FROM strategy_instances i JOIN accounts a ON a.id=i.account_id WHERE i.id=$1 AND i.user_id=$2 FOR UPDATE OF i",
        [id,user.id]
      );
      if(!locked[0])throw new Error("STRATEGY_NOT_FOUND");
      if(String(locked[0].status)==="CLOSED")throw new Error("STRATEGY_CLOSED");

      const rows=await tx.unsafe(
        "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,provenance,confidence) VALUES ($1,$2,'CONTRIBUTION',$3,$4,'USER_ENTERED','VERIFIED') RETURNING id",
        [id, occurredAt, String(locked[0].currency), amount.toString()]
      );
      const ledgerEventId=String(rows[0].id);
      const currentPlan=normalizeContributionPlan(locked[0].contribution_plan);
      let nextPlan=currentPlan;
      if(currentPlan.enabled){
        nextPlan=advanceContributionPlan(currentPlan,occurredAt.toISOString().slice(0,10));
        if(nextPlan.nextDate!==currentPlan.nextDate){
          await tx.unsafe("UPDATE strategy_instances SET contribution_plan=$1::jsonb,updated_at=now() WHERE id=$2",[JSON.stringify(nextPlan),id]);
        }
      }
      await tx.unsafe(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'ledger.contribution-created','ledger_event',$2,$3::jsonb)",
        [user.id,ledgerEventId,JSON.stringify({strategyInstanceId:id,amount:amount.toString(),nextContributionDate:nextPlan.nextDate})]
      );
      return {eventId:ledgerEventId,status:String(locked[0].status)};
    });
    let actionId:string|null=null;
    if(result.status==="ACTIVE"){try{actionId=(await calculateAction(id)).actionId;}catch{}}
    return Response.json({ ok: true, id:result.eventId, actionId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Enter a valid contribution and timestamp." }, { status: 400 });
    }
    const code=error instanceof Error?error.message:"FAILED";
    if(code==="STRATEGY_CLOSED")return Response.json({error:"Closed strategies are read-only."},{status:409});
    return Response.json({ error: "Could not record contribution." }, { status: 500 });
  }
}
