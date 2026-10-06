import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { sql } from "@/lib/db";

const schema=z.object({amount:z.coerce.number().positive(),occurredAt:z.string().datetime().optional()});

export async function POST(request: Request, context: {params: Promise<{id:string}>}) {
  try {
    const user=await requireUser();
    const {id}=await context.params;
    const strategy=await getStrategyForUser(user.id,id);
    if(!strategy) return Response.json({error:"Not found."},{status:404});
    const input=schema.parse(await request.json());
    await sql.unsafe(
      "INSERT INTO ledger_events (strategy_instance_id,occurred_at,event_type,currency,cash_amount,provenance,confidence) VALUES ($1,$2,'CONTRIBUTION',$3,$4,'USER_ENTERED','VERIFIED')",
      [id,input.occurredAt ? new Date(input.occurredAt) : new Date(),strategy.currency,String(input.amount)]
    );
    return Response.json({ok:true});
  } catch(error) {
    if(error instanceof z.ZodError) return Response.json({error:"Enter a valid contribution."},{status:400});
    return Response.json({error:"Could not record contribution."},{status:500});
  }
}
