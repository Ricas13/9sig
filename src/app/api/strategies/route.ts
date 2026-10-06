import { z } from "zod";
import { requireUser } from "@/lib/session";
import { createStrategy } from "@/lib/strategy-service";
import { assertSameOrigin } from "@/lib/security";
import { calculateAction } from "@/lib/action-service";

const schema = z.object({
  strategyKey:z.string().min(1),
  name:z.string().min(1).max(80),
  wrapper:z.string().min(1).max(40),
  broker:z.string().max(80).optional().nullable(),
  currency:z.string().length(3),
  onboardingMode:z.enum(["START_NEW","RESUME"]),
  startingCash:z.string().optional(),
  approximateValue:z.string().optional(),
  settings:z.record(z.string(),z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const id = await createStrategy(user.id,user.country,input);
    try { await calculateAction(id); } catch { }
    return Response.json({ok:true,id},{status:201});
  } catch(error) {
    if (error instanceof z.ZodError) return Response.json({error:"Check the strategy details."},{status:400});
    const code = error instanceof Error ? error.message : "FAILED";
    if (code === "PLAN_STRATEGY_LIMIT" || code === "STRATEGY_NOT_IN_PLAN") return Response.json({error:"Your current plan does not allow this strategy instance."},{status:403});
    if(code==="STRATEGY_NOT_SUPPORTED_IN_REGION"||code==="STRATEGY_NOT_SUPPORTED_FOR_WRAPPER")return Response.json({error:"This strategy is not currently supported for that region or account type."},{status:400});
    if(code.startsWith("MISSING_STRATEGY_INPUT:")||code.startsWith("INVALID_STRATEGY_INPUT:")||code==="UNKNOWN_STRATEGY_INPUT")return Response.json({error:"Check the strategy-specific setup fields."},{status:400});
    return Response.json({error:"Could not create strategy."},{status:500});
  }
}
