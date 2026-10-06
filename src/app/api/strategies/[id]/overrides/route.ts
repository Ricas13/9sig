import Decimal from "decimal.js";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { calculateAction } from "@/lib/action-service";
import { sql } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";

const create=z.object({
  fieldKey:z.string().min(1).max(120),
  manualValue:z.union([z.string(),z.number()]),
  reason:z.string().max(240).optional()
});

async function resolveOverride(
  strategyInstanceId:string,
  fieldKey:string,
  manualValue:string|number
){
  const manual=new Decimal(String(manualValue));
  if(!manual.isFinite())throw new Error("INVALID_OVERRIDE_VALUE");

  if(fieldKey==="strategy_state.targetValue"){
    if(manual.lt(0))throw new Error("INVALID_OVERRIDE_VALUE");
    const states=await sql.unsafe(
      "SELECT state->>'targetValue' AS automatic_value FROM strategy_states WHERE strategy_instance_id=$1 LIMIT 1",
      [strategyInstanceId]
    );
    return {automaticValue:states[0]?.automatic_value??null,manualValue:manual.toString()};
  }

  const match=/^market_price:([0-9a-fA-F-]{36})$/.exec(fieldKey);
  if(!match)throw new Error("OVERRIDE_FIELD_NOT_ALLOWED");
  if(manual.lte(0))throw new Error("INVALID_OVERRIDE_VALUE");
  const tradingLineId=match[1];

  const held=await sql.unsafe(
    "SELECT COALESCE(sum(quantity),0) AS quantity FROM ledger_events WHERE strategy_instance_id=$1 AND trading_line_id=$2",
    [strategyInstanceId,tradingLineId]
  );
  if(new Decimal(String(held[0]?.quantity??0)).eq(0))throw new Error("TRADING_LINE_NOT_HELD");

  const latest=await sql.unsafe(
    "SELECT price FROM market_data_observations WHERE trading_line_id=$1 ORDER BY observed_at DESC LIMIT 1",
    [tradingLineId]
  );
  return {automaticValue:latest[0]?.price??null,manualValue:manual.toString()};
}

async function recalculateIfActive(userId:string,id:string){
  const strategy=await getStrategyForUser(userId,id);
  if(strategy&&String(strategy.status)==="ACTIVE"){
    try{await calculateAction(id);}catch{}
  }
}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const {id}=await context.params;
    if(!await getStrategyForUser(user.id,id))return Response.json({error:"Not found."},{status:404});
    const p=create.parse(await request.json());
    const resolved=await resolveOverride(id,p.fieldKey,p.manualValue);

    await sql.begin(async(tx)=>{
      await tx.unsafe(
        "UPDATE overrides SET active=false,restored_at=now(),updated_at=now() WHERE strategy_instance_id=$1 AND field_key=$2 AND active=true",
        [id,p.fieldKey]
      );
      await tx.unsafe(
        "INSERT INTO overrides (strategy_instance_id,field_key,automatic_value,manual_value,reason,created_by) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,'USER')",
        [id,p.fieldKey,JSON.stringify(resolved.automaticValue),JSON.stringify(resolved.manualValue),p.reason??null]
      );
      await tx.unsafe(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'override.created','strategy_instance',$2,$3::jsonb)",
        [user.id,id,JSON.stringify({fieldKey:p.fieldKey,reason:p.reason??null})]
      );
    });
    await recalculateIfActive(user.id,id);
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Invalid override."},{status:400});
    const code=error instanceof Error?error.message:"FAILED";
    const messages:Record<string,string>={
      INVALID_OVERRIDE_VALUE:"Enter a valid override value.",
      OVERRIDE_FIELD_NOT_ALLOWED:"That field cannot be overridden.",
      TRADING_LINE_NOT_HELD:"That market price is not for a currently held trading line."
    };
    return Response.json({error:messages[code]??"Could not save override."},{status:400});
  }
}

export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const {id}=await context.params;
    if(!await getStrategyForUser(user.id,id))return Response.json({error:"Not found."},{status:404});
    const body=await request.json();
    const fieldKey=typeof body.fieldKey==="string"?body.fieldKey:"";
    if(fieldKey!=="strategy_state.targetValue"&&!/^market_price:[0-9a-fA-F-]{36}$/.test(fieldKey)){
      return Response.json({error:"Invalid field."},{status:400});
    }
    await sql.begin(async(tx)=>{
      await tx.unsafe(
        "UPDATE overrides SET active=false,restored_at=now(),updated_at=now() WHERE strategy_instance_id=$1 AND field_key=$2 AND active=true",
        [id,fieldKey]
      );
      await tx.unsafe(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'override.restored','strategy_instance',$2,$3::jsonb)",
        [user.id,id,JSON.stringify({fieldKey})]
      );
    });
    await recalculateIfActive(user.id,id);
    return Response.json({ok:true});
  }catch{
    return Response.json({error:"Could not restore automatic value."},{status:500});
  }
}
