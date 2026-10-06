import Decimal from "decimal.js";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";

const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value)=>{
  const parsed=new Date(value+"T00:00:00Z");
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
},"Invalid date");
const positiveDecimal=z.string().refine((value)=>{
  try{const d=new Decimal(value);return d.isFinite()&&d.gt(0);}catch{return false;}
},"Value must be positive");
const rowSchema=z.object({
  date:isoDate,
  value:positiveDecimal,
  benchmarkValue:positiveDecimal.nullable().optional()
});
const schema=z.object({
  strategyVersionId:z.string().uuid(),
  points:z.array(rowSchema).min(1).max(5000),
  source:z.string().min(1).max(80).default("ADMIN")
});

export async function PUT(request:Request){
  try{
    assertSameOrigin(request);
    const admin=await requireAdmin();
    const input=schema.parse(await request.json());
    const dates=new Set<string>();
    for(const point of input.points){
      if(dates.has(point.date))return Response.json({error:"Duplicate model date: "+point.date},{status:400});
      dates.add(point.date);
    }
    const version=await sql.unsafe("SELECT id FROM strategy_versions WHERE id=$1 LIMIT 1",[input.strategyVersionId]);
    if(!version[0])return Response.json({error:"Strategy version not found."},{status:404});

    await sql.begin(async(tx)=>{
      for(const point of input.points){
        await tx.unsafe(
          "INSERT INTO canonical_model_performance (strategy_version_id,date,value,benchmark_value,source,metadata) VALUES ($1,$2,$3,$4,$5,'{}'::jsonb)"+
          " ON CONFLICT (strategy_version_id,date) DO UPDATE SET value=EXCLUDED.value,benchmark_value=EXCLUDED.benchmark_value,source=EXCLUDED.source",
          [input.strategyVersionId,point.date,point.value,point.benchmarkValue??null,input.source]
        );
      }
      await tx.unsafe(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'model-performance.upsert','strategy_version',$2,$3::jsonb)",
        [admin.id,input.strategyVersionId,JSON.stringify({points:input.points.length,firstDate:[...dates].sort()[0],lastDate:[...dates].sort().at(-1)})]
      );
    });
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Model points must contain valid dates and positive numeric values."},{status:400});
    return Response.json({error:"Could not update model performance."},{status:500});
  }
}
