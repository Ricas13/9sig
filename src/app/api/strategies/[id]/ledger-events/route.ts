import Decimal from "decimal.js";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { calculateAction } from "@/lib/action-service";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";

const amount=z.string().regex(/^\d+(?:\.\d{1,8})?$/);
const schema=z.object({
  eventType:z.enum(["WITHDRAWAL","DIVIDEND","DISTRIBUTION","INTEREST","FEE","TAX"]),
  amount,
  occurredAt:z.string().datetime({offset:true}).optional(),
  note:z.string().max(240).optional()
});

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const {id}=await context.params;
    const strategy=await getStrategyForUser(user.id,id);
    if(!strategy)return Response.json({error:"Not found."},{status:404});
    const input=schema.parse(await request.json());
    const value=new Decimal(input.amount);
    if(!value.isFinite()||value.lte(0))return Response.json({error:"Enter a positive amount."},{status:400});

    let cashAmount=new Decimal(0);
    let feeAmount=new Decimal(0);
    if(["DIVIDEND","DISTRIBUTION","INTEREST"].includes(input.eventType))cashAmount=value;
    if(["WITHDRAWAL","TAX"].includes(input.eventType))cashAmount=value.neg();
    if(input.eventType==="FEE")feeAmount=value;

    if(String(strategy.status)==="CLOSED")return Response.json({error:"Closed strategies are read-only."},{status:409});

    const eventId=await sql.begin(async(tx)=>{
      const locked=await tx.unsafe("SELECT id,status FROM strategy_instances WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,user.id]);
      if(!locked[0])throw new Error("STRATEGY_NOT_FOUND");
      if(String(locked[0].status)==="CLOSED")throw new Error("STRATEGY_CLOSED");
      const rows=await tx.unsafe(
        "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,fee_amount,provenance,confidence,metadata)"+
        " VALUES ($1,$2,$3,$4,$5,$6,'USER_ENTERED','VERIFIED',$7::jsonb) RETURNING id",
        [id,input.occurredAt?new Date(input.occurredAt):new Date(),input.eventType,strategy.currency,cashAmount.toString(),feeAmount.toString(),JSON.stringify({note:input.note??null})]
      );
      const ledgerEventId=String(rows[0].id);
      await tx.unsafe(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'ledger.cash-event-created','ledger_event',$2,$3::jsonb)",
        [user.id,ledgerEventId,JSON.stringify({strategyInstanceId:id,eventType:input.eventType})]
      );
      return ledgerEventId;
    });
    let actionId:string|null=null;
    if(String(strategy.status)==="ACTIVE"){try{actionId=(await calculateAction(id)).actionId;}catch{}}
    return Response.json({ok:true,id:eventId,actionId});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Check the cash event details."},{status:400});
    const code=error instanceof Error?error.message:"FAILED";
    if(code==="STRATEGY_CLOSED")return Response.json({error:"Closed strategies are read-only."},{status:409});
    return Response.json({error:"Could not record the cash event."},{status:500});
  }
}
