import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";

const definitionSchema=z.object({key:z.string().min(1),name:z.string().min(1),family:z.string().min(1),description:z.string(),engine:z.string().min(1),enabled:z.boolean(),proprietary:z.boolean(),defaultBenchmarkKey:z.string().nullable().optional(),supportedRegions:z.array(z.string()),supportedWrappers:z.array(z.string()),requiredInputs:z.array(z.unknown()).default([])});
const versionSchema=z.object({strategyKey:z.string().min(1),version:z.string().min(1),effectiveFrom:z.string(),effectiveTo:z.string().nullable().optional(),config:z.record(z.string(),z.unknown()),disclosure:z.string().default("")});

export async function PUT(request:Request){
  try{assertSameOrigin(request);const admin=await requireAdmin();const p=definitionSchema.parse(await request.json());await sql.unsafe(
    "INSERT INTO strategy_definitions (key,name,family,description,engine,enabled,proprietary,default_benchmark_key,supported_regions,supported_wrappers,required_inputs)" +
    " VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)" +
    " ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name,family=EXCLUDED.family,description=EXCLUDED.description,engine=EXCLUDED.engine,enabled=EXCLUDED.enabled,proprietary=EXCLUDED.proprietary,default_benchmark_key=EXCLUDED.default_benchmark_key,supported_regions=EXCLUDED.supported_regions,supported_wrappers=EXCLUDED.supported_wrappers,required_inputs=EXCLUDED.required_inputs,updated_at=now()",
    [p.key,p.name,p.family,p.description,p.engine,p.enabled,p.proprietary,p.defaultBenchmarkKey??null,JSON.stringify(p.supportedRegions),JSON.stringify(p.supportedWrappers),JSON.stringify(p.requiredInputs)]
  );await sql.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'strategy-definition.upsert','strategy_definition',$2)",[admin.id,p.key]);return Response.json({ok:true});}
  catch(error){if(error instanceof z.ZodError)return Response.json({error:"Invalid strategy definition."},{status:400});return Response.json({error:"Could not update strategy."},{status:500});}
}

export async function POST(request:Request){
  try{assertSameOrigin(request);const admin=await requireAdmin();const p=versionSchema.parse(await request.json());const defs=await sql.unsafe("SELECT id FROM strategy_definitions WHERE key=$1 LIMIT 1",[p.strategyKey]);if(!defs[0])return Response.json({error:"Strategy not found."},{status:404});
  await sql.unsafe("INSERT INTO strategy_versions (strategy_definition_id,version,effective_from,effective_to,config,disclosure) VALUES ($1,$2,$3,$4,$5::jsonb,$6)",[defs[0].id,p.version,p.effectiveFrom,p.effectiveTo??null,JSON.stringify(p.config),p.disclosure]);
  await sql.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'strategy-version.created','strategy_definition',$2,$3::jsonb)",[admin.id,String(defs[0].id),JSON.stringify({version:p.version})]);return Response.json({ok:true});}
  catch(error){if(error instanceof z.ZodError)return Response.json({error:"Invalid strategy version."},{status:400});return Response.json({error:"Could not create strategy version."},{status:500});}
}
