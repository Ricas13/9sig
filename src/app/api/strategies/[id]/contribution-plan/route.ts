import { z } from "zod";
import { requireUser } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { getStrategyForUser } from "@/lib/strategy-service";
import { normalizeContributionPlan } from "@/domain/contribution-plan";
import { sql } from "@/lib/db";

const schema=z.object({
  enabled:z.boolean(),
  amount:z.string().regex(/^\d+(?:\.\d{1,8})?$/),
  frequency:z.enum(["WEEKLY","MONTHLY","QUARTERLY"]),
  nextDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
});

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const {id}=await context.params;
    const strategy=await getStrategyForUser(user.id,id);
    if(!strategy)return Response.json({error:"Not found."},{status:404});
    const input=schema.parse(await request.json());
    const plan=normalizeContributionPlan(input);
    await sql.begin(async(tx)=>{
      const locked=await tx.unsafe("SELECT id FROM strategy_instances WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,user.id]);
      if(!locked[0])throw new Error("STRATEGY_NOT_FOUND");
      await tx.unsafe("UPDATE strategy_instances SET contribution_plan=$1::jsonb,updated_at=now() WHERE id=$2",[JSON.stringify(plan),id]);
      await tx.unsafe(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'strategy.contribution-plan.updated','strategy_instance',$2,$3::jsonb)",
        [user.id,id,JSON.stringify(plan)]
      );
    });
    return Response.json({ok:true,plan});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Check your contribution plan."},{status:400});
    const code=error instanceof Error?error.message:"FAILED";
    if(code.startsWith("INVALID_CONTRIBUTION_"))return Response.json({error:"Enter a valid contribution amount, frequency and next date."},{status:400});
    return Response.json({error:"Could not update the contribution plan."},{status:500});
  }
}
