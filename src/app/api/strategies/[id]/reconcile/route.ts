import Decimal from "decimal.js";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { sql } from "@/lib/db";

const schema=z.object({expectedValue:z.coerce.number().nonnegative(),brokerValue:z.coerce.number().nonnegative(),reason:z.string().max(120).optional()});

export async function POST(request: Request, context: {params: Promise<{id:string}>}) {
  try {
    const user=await requireUser();
    const {id}=await context.params;
    const strategy=await getStrategyForUser(user.id,id);
    if(!strategy) return Response.json({error:"Not found."},{status:404});
    const input=schema.parse(await request.json());
    const difference=new Decimal(input.brokerValue).minus(input.expectedValue);
    await sql.begin(async(tx)=>{
      await tx.unsafe(
        "INSERT INTO reconciliations (strategy_instance_id,occurred_at,expected_value,broker_reported_value,difference,reason,provenance) VALUES ($1,now(),$2,$3,$4,$5,'USER_CONFIRMED')",
        [id,String(input.expectedValue),String(input.brokerValue),difference.toString(),input.reason ?? null]
      );
      if(!difference.eq(0)) {
        await tx.unsafe(
          "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,provenance,confidence,metadata) VALUES ($1,now(),'BROKER_ADJUSTMENT',$2,$3,'USER_CONFIRMED','VERIFIED',$4::jsonb)",
          [id,strategy.currency,difference.toString(),JSON.stringify({reason:input.reason ?? "Unknown adjustment"})]
        );
      }
      await tx.unsafe("UPDATE strategy_instances SET last_reconciled_at=now(),health_status='HEALTHY',updated_at=now() WHERE id=$1",[id]);
      await tx.unsafe("UPDATE strategy_states SET state=state-'resumeNeedsReconciliation',confidence='HIGH',calculated_at=now() WHERE strategy_instance_id=$1",[id]);
    });
    return Response.json({ok:true,difference:difference.toString()});
  } catch(error) {
    if(error instanceof z.ZodError) return Response.json({error:"Check the reconciliation amounts."},{status:400});
    return Response.json({error:"Could not reconcile strategy."},{status:500});
  }
}
