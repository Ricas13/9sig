import { z } from "zod";
import { requireUser } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { previewCashScenario } from "@/lib/action-service";
import { loadEntitlements } from "@/lib/entitlement-service";

const schema=z.object({
  type:z.enum(["CONTRIBUTION","WITHDRAWAL"]),
  amount:z.string().regex(/^\d+(?:\.\d{1,8})?$/)
});

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const {id}=await context.params;
    const entitlements=await loadEntitlements(user.id);
    if(!entitlements.features.has("what_if"))return Response.json({error:"What-if previews are not included in your current plan."},{status:403});
    const input=schema.parse(await request.json());
    const result=await previewCashScenario(user.id,id,input);
    return Response.json({ok:true,preview:true,result});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Enter a valid scenario amount."},{status:400});
    const code=error instanceof Error?error.message:"FAILED";
    if(code==="STRATEGY_INSTANCE_NOT_FOUND")return Response.json({error:"Strategy not found."},{status:404});
    if(code==="INVALID_PREVIEW_AMOUNT")return Response.json({error:"Enter an amount greater than zero."},{status:400});
    return Response.json({error:"Could not preview that scenario."},{status:400});
  }
}
