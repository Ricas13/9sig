import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";
import { supportedEngineKeys, validateEngineConfig, assertCustomerPublishableEngine } from "@/domain/strategy/registry";
import { parseInputSchema } from "@/domain/strategy/config";
import { authFailure } from "@/lib/api-auth";

const definitionSchema=z.object({
  key:z.string().min(1),name:z.string().min(1),family:z.string().min(1),description:z.string(),
  engine:z.string().min(1),enabled:z.boolean(),proprietary:z.boolean(),
  defaultBenchmarkKey:z.string().nullable().optional(),supportedRegions:z.array(z.string()),
  supportedWrappers:z.array(z.string()),requiredInputs:z.array(z.unknown()).default([])
});
const versionSchema=z.object({
  strategyKey:z.string().min(1),version:z.string().min(1),effectiveFrom:z.string(),
  effectiveTo:z.string().nullable().optional(),engineKey:z.string().optional(),
  inputSchema:z.array(z.unknown()).optional(),config:z.record(z.string(),z.unknown()),
  disclosure:z.string().default(""),releaseNotes:z.string().default(""),
  upgradePolicy:z.enum(["OPTIONAL","RECOMMENDED","REQUIRED"]).default("OPTIONAL")
});
const patchSchema=z.discriminatedUnion("action",[
  z.object({
    action:z.literal("UPDATE_DRAFT"),versionId:z.string().uuid(),
    effectiveFrom:z.string().optional(),effectiveTo:z.string().nullable().optional(),
    engineKey:z.string().optional(),inputSchema:z.array(z.unknown()).optional(),
    config:z.record(z.string(),z.unknown()).optional(),disclosure:z.string().optional(),
    releaseNotes:z.string().optional(),upgradePolicy:z.enum(["OPTIONAL","RECOMMENDED","REQUIRED"]).optional()
  }),
  z.object({action:z.literal("PUBLISH"),versionId:z.string().uuid()}),
  z.object({action:z.literal("RETIRE"),versionId:z.string().uuid()})
]);

function assertEngine(key:string){
  if(!supportedEngineKeys().includes(key))throw new Error("UNSUPPORTED_ENGINE");
}

export async function PUT(request:Request){
  try{
    assertSameOrigin(request);
    const admin=await requireAdmin();
    const p=definitionSchema.parse(await request.json());
    assertEngine(p.engine);
    parseInputSchema(p.requiredInputs);
    await sql.unsafe(
      "INSERT INTO strategy_definitions (key,name,family,description,engine,enabled,proprietary,default_benchmark_key,supported_regions,supported_wrappers,required_inputs)"+
      " VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)"+
      " ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name,family=EXCLUDED.family,description=EXCLUDED.description,engine=EXCLUDED.engine,enabled=EXCLUDED.enabled,proprietary=EXCLUDED.proprietary,default_benchmark_key=EXCLUDED.default_benchmark_key,supported_regions=EXCLUDED.supported_regions,supported_wrappers=EXCLUDED.supported_wrappers,required_inputs=EXCLUDED.required_inputs,updated_at=now()",
      [p.key,p.name,p.family,p.description,p.engine,p.enabled,p.proprietary,p.defaultBenchmarkKey??null,JSON.stringify(p.supportedRegions),JSON.stringify(p.supportedWrappers),JSON.stringify(p.requiredInputs)]
    );
    await sql.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'strategy-definition.upsert','strategy_definition',$2)",[admin.id,p.key]);
    return Response.json({ok:true});
  }catch(error){const denied=authFailure(error);if(denied)return denied;
    if(error instanceof z.ZodError)return Response.json({error:"Invalid strategy definition."},{status:400});
    const code=error instanceof Error?error.message:"FAILED";
    if(code==="UNSUPPORTED_ENGINE"||code==="INVALID_INPUT_SCHEMA")return Response.json({error:"The strategy engine or input schema is invalid."},{status:400});
    return Response.json({error:"Could not update strategy."},{status:500});
  }
}

export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    const admin=await requireAdmin();
    const p=versionSchema.parse(await request.json());
    const defs=await sql.unsafe("SELECT id,engine,required_inputs FROM strategy_definitions WHERE key=$1 LIMIT 1",[p.strategyKey]);
    if(!defs[0])return Response.json({error:"Strategy not found."},{status:404});
    const engineKey=p.engineKey??String(defs[0].engine);
    const inputSchema=p.inputSchema??(Array.isArray(defs[0].required_inputs)?defs[0].required_inputs:[]);
    assertEngine(engineKey);
    validateEngineConfig(engineKey,p.config);
    parseInputSchema(inputSchema);
    const rows=await sql.unsafe(
      "INSERT INTO strategy_versions (strategy_definition_id,version,effective_from,effective_to,engine_key,lifecycle_status,upgrade_policy,input_schema,config,disclosure,release_notes)"+
      " VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7::jsonb,$8::jsonb,$9,$10) RETURNING id",
      [defs[0].id,p.version,p.effectiveFrom,p.effectiveTo??null,engineKey,p.upgradePolicy,JSON.stringify(inputSchema),JSON.stringify(p.config),p.disclosure,p.releaseNotes]
    );
    await sql.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'strategy-version.draft-created','strategy_version',$2,$3::jsonb)",
      [admin.id,String(rows[0].id),JSON.stringify({strategyKey:p.strategyKey,version:p.version})]
    );
    return Response.json({ok:true,id:String(rows[0].id),status:"DRAFT"});
  }catch(error){const denied=authFailure(error);if(denied)return denied;
    if(error instanceof z.ZodError)return Response.json({error:"Invalid strategy version."},{status:400});
    const message=error instanceof Error?error.message:"FAILED";
    return Response.json({error:message.startsWith("INVALID_")||message.includes("REQUIRES")||message.includes("WEIGHTS")||message==="ENGINE_NOT_CUSTOMER_VERIFIED"?"Strategy configuration failed validation.":"Could not create strategy version."},{status:400});
  }
}

export async function PATCH(request:Request){
  try{
    assertSameOrigin(request);
    const admin=await requireAdmin();
    const p=patchSchema.parse(await request.json());
    const rows=await sql.unsafe(
      "SELECT v.*,d.key AS strategy_key,d.engine AS default_engine FROM strategy_versions v JOIN strategy_definitions d ON d.id=v.strategy_definition_id WHERE v.id=$1 LIMIT 1",
      [p.versionId]
    );
    const current=rows[0];
    if(!current)return Response.json({error:"Version not found."},{status:404});

    if(p.action==="UPDATE_DRAFT"){
      if(String(current.lifecycle_status)!=="DRAFT")return Response.json({error:"Published strategy versions are immutable. Create a new version instead."},{status:409});
      const engineKey=p.engineKey??String(current.engine_key);
      const config=p.config??((current.config??{}) as Record<string,unknown>);
      const inputSchema=p.inputSchema??(Array.isArray(current.input_schema)?current.input_schema:[]);
      assertEngine(engineKey);validateEngineConfig(engineKey,config);parseInputSchema(inputSchema);
      await sql.unsafe(
        "UPDATE strategy_versions SET effective_from=$1,effective_to=$2,engine_key=$3,upgrade_policy=$4,input_schema=$5::jsonb,config=$6::jsonb,disclosure=$7,release_notes=$8 WHERE id=$9",
        [p.effectiveFrom??current.effective_from,p.effectiveTo===undefined?current.effective_to:p.effectiveTo,engineKey,p.upgradePolicy??current.upgrade_policy,JSON.stringify(inputSchema),JSON.stringify(config),p.disclosure??current.disclosure,p.releaseNotes??current.release_notes,p.versionId]
      );
      await sql.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'strategy-version.draft-updated','strategy_version',$2)",[admin.id,p.versionId]);
      return Response.json({ok:true,status:"DRAFT"});
    }

    if(p.action==="PUBLISH"){
      if(String(current.lifecycle_status)!=="DRAFT")return Response.json({error:"Only a draft version can be published."},{status:409});
      assertEngine(String(current.engine_key));
      assertCustomerPublishableEngine(String(current.engine_key));
      validateEngineConfig(String(current.engine_key),(current.config??{}) as Record<string,unknown>);
      parseInputSchema(current.input_schema);
      const duplicate=await sql.unsafe(
        "SELECT id FROM strategy_versions WHERE strategy_definition_id=$1 AND lifecycle_status='PUBLISHED' AND effective_from=$2 AND id<>$3 LIMIT 1",
        [current.strategy_definition_id,current.effective_from,p.versionId]
      );
      if(duplicate[0])return Response.json({error:"Another published version already has that effective date."},{status:409});
      await sql.begin(async(tx)=>{
        await tx.unsafe("UPDATE strategy_versions SET lifecycle_status='PUBLISHED',published_at=now() WHERE id=$1",[p.versionId]);
        await tx.unsafe(
          "INSERT INTO notifications (user_id,type,title,body) SELECT DISTINCT i.user_id,'STRATEGY_VERSION',$1,$2 FROM strategy_instances i WHERE i.strategy_definition_id=$3 AND i.strategy_version_id<>$4 AND i.status IN ('ACTIVE','PAUSED')",
          ["Strategy update available: "+String(current.strategy_key)+" v"+String(current.version),String(current.release_notes||"A new strategy rules version is available to review."),current.strategy_definition_id,p.versionId]
        );
        await tx.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'strategy-version.published','strategy_version',$2)",[admin.id,p.versionId]);
      });
      return Response.json({ok:true,status:"PUBLISHED"});
    }

    await sql.unsafe("UPDATE strategy_versions SET lifecycle_status='RETIRED',effective_to=COALESCE(effective_to,current_date) WHERE id=$1",[p.versionId]);
    await sql.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'strategy-version.retired','strategy_version',$2)",[admin.id,p.versionId]);
    return Response.json({ok:true,status:"RETIRED"});
  }catch(error){const denied=authFailure(error);if(denied)return denied;
    if(error instanceof z.ZodError)return Response.json({error:"Invalid strategy version operation."},{status:400});
    const message=error instanceof Error?error.message:"FAILED";
    return Response.json({error:message.startsWith("INVALID_")||message.includes("REQUIRES")||message.includes("WEIGHTS")?"Strategy configuration failed validation.":"Could not update strategy version."},{status:400});
  }
}
