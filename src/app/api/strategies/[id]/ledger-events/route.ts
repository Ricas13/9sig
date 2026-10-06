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

    const rows=await sql.unsafe(
      "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,fee_amount,provenance,confidence,metadata)"+
      " VALUES ($1,$2,$3,$4,$5,$6,'USER_ENTERED','VERIFIED',$7::jsonb) RETURNING id",
      [id,input.occurredAt?new Date(input.occurredAt):new Date(),input.eventType,strategy.currency,cashAmount.toString(),feeAmount.toString(),JSON.stringify({note:input.note??null})]
    );
    await sql.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'ledger.cash-event-created','ledger_event',$2,$3::jsonb)",
      [user.id,String(rows[0].id),JSON.stringify({strategyInstanceId:id,eventType:input.eventType})]
    );
    let actionId:string|null=null;
    if(String(strategy.status)==="ACTIVE"){try{actionId=(await calculateAction(id)).actionId;}catch{}}
    return Response.json({ok:true,id:String(rows[0].id),actionId});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Check the cash event details."},{status:400});
    return Response.json({error:"Could not record the cash event."},{status:500});
  }
}
