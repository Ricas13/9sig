import { z } from "zod";
import { requireUser } from "@/lib/session";
import { createStrategy } from "@/lib/strategy-service";
import { assertSameOrigin } from "@/lib/security";
import { calculateAction } from "@/lib/action-service";

const schema = z.object({
  strategyKey:z.string().min(1),
  name:z.string().min(1).max(80),
  wrapper:z.enum(["ISA","SIPP","TAXABLE"]),
  broker:z.string().max(80).optional().nullable(),
  currency:z.string().length(3),
  onboardingMode:z.enum(["START_NEW","RESUME"]),
  startingCash:z.string().optional(),
  approximateValue:z.string().optional()
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
    return Response.json({error:"Could not create strategy."},{status:500});
  }
}
