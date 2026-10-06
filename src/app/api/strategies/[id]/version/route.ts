import { z } from "zod";
import { requireUser } from "@/lib/session";
import { migrateStrategyVersion } from "@/lib/strategy-service";
import { calculateAction } from "@/lib/action-service";
import { assertSameOrigin } from "@/lib/security";

const schema=z.object({targetVersionId:z.string().uuid(),settings:z.record(z.string(),z.unknown()).optional()});

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const {id}=await context.params;
    const input=schema.parse(await request.json());
    const result=await migrateStrategyVersion(user.id,id,input.targetVersionId,input.settings);
    let actionId:string|null=null;
    if(result.changed){try{actionId=(await calculateAction(id)).actionId;}catch{}}
    return Response.json({ok:true,changed:result.changed,actionId});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Invalid version update."},{status:400});
    const code=error instanceof Error?error.message:"FAILED";
    const messages:Record<string,string>={
      STRATEGY_INSTANCE_NOT_FOUND:"Strategy not found.",
      STRATEGY_ALREADY_CLOSED:"A closed strategy cannot be updated.",
      INVALID_TARGET_VERSION:"That strategy version is not available.",
      ENGINE_MIGRATION_NOT_SUPPORTED:"This release changes engine families and requires an administrator migration path."
    };
    if(code.startsWith("MISSING_STRATEGY_INPUT:"))return Response.json({error:"This strategy release requires additional setup information."},{status:409});
    return Response.json({error:messages[code]??"Could not update the strategy version."},{status:400});
  }
}
