import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { sql } from "@/lib/db";

const rowSchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),value:z.string(),benchmarkValue:z.string().nullable().optional()});
const schema=z.object({strategyVersionId:z.string().uuid(),points:z.array(rowSchema).min(1).max(5000),source:z.string().max(80).default("ADMIN")});

export async function PUT(request:Request){
  try{
    const admin=await requireAdmin();
    const input=schema.parse(await request.json());
    await sql.begin(async(tx)=>{
      for(const point of input.points){
        await tx.unsafe(
          "INSERT INTO canonical_model_performance (strategy_version_id,date,value,benchmark_value,source,metadata) VALUES ($1,$2,$3,$4,$5,'{}'::jsonb)" +
          " ON CONFLICT (strategy_version_id,date) DO UPDATE SET value=EXCLUDED.value,benchmark_value=EXCLUDED.benchmark_value,source=EXCLUDED.source",
          [input.strategyVersionId,point.date,point.value,point.benchmarkValue??null,input.source]
        );
      }
      await tx.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'model-performance.upsert','strategy_version',$2,$3::jsonb)",[admin.id,input.strategyVersionId,JSON.stringify({points:input.points.length})]);
    });
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Invalid model performance payload."},{status:400});
    return Response.json({error:"Could not update model performance."},{status:500});
  }
}
