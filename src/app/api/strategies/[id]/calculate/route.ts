import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { calculateAction } from "@/lib/action-service";
import { assertSameOrigin } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{id:string}> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const {id} = await context.params;
    const strategy = await getStrategyForUser(user.id,id);
    if (!strategy) return Response.json({error:"Not found."},{status:404});
    const result = await calculateAction(id);
    return Response.json({ok:true,actionId:result.actionId});
  } catch {
    return Response.json({error:"Could not recalculate this strategy."},{status:500});
  }
}
