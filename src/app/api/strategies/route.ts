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
  settings:z.record(z.string(),z.unknown()).optional(),
  executionConstraints:z.object({
    fractionalShares:z.boolean().optional(),
    minimumTradeAmount:z.string().regex(/^\d+(?:\.\d{1,8})?$/).optional(),
    cashBufferAmount:z.string().regex(/^\d+(?:\.\d{1,8})?$/).optional(),
    flatFee:z.string().regex(/^\d+(?:\.\d{1,8})?$/).optional(),
    allowSelling:z.boolean().optional()
  }).optional(),
  contributionPlan:z.object({
    enabled:z.boolean(),
    amount:z.string().regex(/^\d+(?:\.\d{1,8})?$/),
    frequency:z.enum(["WEEKLY","MONTHLY","QUARTERLY"]),
    nextDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
  }).optional()
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
    if (code === "PLAN_STRATEGY_LIMIT") return Response.json({error:"You have reached the active-strategy limit for your current plan.",code,upgrade:true},{status:403});
    if (code === "STRATEGY_NOT_IN_PLAN") return Response.json({error:"This strategy is not included in your current plan.",code,upgrade:true},{status:403});
    if(code==="STRATEGY_NOT_SUPPORTED_IN_REGION"||code==="STRATEGY_NOT_SUPPORTED_FOR_WRAPPER")return Response.json({error:"This strategy is not currently supported for that region or account type."},{status:400});
    if(code.startsWith("MISSING_STRATEGY_INPUT:")||code.startsWith("INVALID_STRATEGY_INPUT:")||code==="UNKNOWN_STRATEGY_INPUT")return Response.json({error:"Check the strategy-specific setup fields."},{status:400});
    return Response.json({error:"Could not create strategy."},{status:500});
  }
}
