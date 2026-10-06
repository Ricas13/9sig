import { z } from "zod";
import { requireUser } from "@/lib/session";
import { executeAction } from "@/lib/action-service";
import { assertSameOrigin } from "@/lib/security";

const positive = z.string().regex(/^\d+(?:\.\d{1,12})?$/);
const nonNegative = z.string().regex(/^\d+(?:\.\d{1,12})?$/);
const schema = z.object({
  price: positive.optional(),
  quantity: positive.optional(),
  fee: nonNegative.optional()
});

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const {id}=await context.params;
    const input=schema.parse(await request.json().catch(()=>({})));
    await executeAction(user.id,id,input);
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Enter valid price, quantity and fee values."},{status:400});
    const code=error instanceof Error?error.message:"FAILED";
    const messages:Record<string,string>={
      EXECUTION_DETAILS_REQUIRED:"Confirm the execution price before marking this trade complete.",
      REBALANCE_TRADES_REQUIRED:"Record the individual rebalance trades before completing this action.",
      EXECUTION_NOTIONAL_MISMATCH:"The actual fill differs too much from the calculated action. Recalculate before confirming it.",
      INSUFFICIENT_CASH:"This execution would use more cash than the strategy ledger currently has.",
      INSUFFICIENT_HOLDINGS:"This execution would sell more units than the strategy ledger currently holds.",
      EXECUTION_CURRENCY_MISMATCH:"The execution currency does not match the account currency.",
      EXECUTION_TRADING_LINE_REQUIRED:"This action is missing its exchange/trading-line identity. Recalculate it before confirming execution."
    };
    return Response.json({error:messages[code]??"Could not complete this action."},{status:400});
  }
}
