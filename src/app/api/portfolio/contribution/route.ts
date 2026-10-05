import { z } from "zod";
import { sql } from "@/lib/db";
import { todayIso } from "@/lib/dates";
import { requireUser } from "@/lib/request-user";
import { buildStrategyState } from "@/lib/strategy";

const schema=z.object({amount:z.coerce.number().positive(),reservePrice:z.coerce.number().positive().optional()});

export async function POST(request:Request) {
  try {
    const {portfolio}=await requireUser();
    const data=schema.parse(await request.json());
    const state=await buildStrategyState(portfolio,data.reservePrice?{reservePrice:data.reservePrice}:undefined);
    const reservePrice=data.reservePrice??state.reservePrice;
    if(!reservePrice) return Response.json({error:"Confirm the CSH2 price first."},{status:400});
    await sql`
      INSERT INTO transactions (portfolio_id, occurred_at, event_type, action, contribution_amount, reserve_units_delta, reserve_price, note)
      VALUES (${portfolio.id}, ${todayIso()}, 'CONTRIBUTION', 'BUY_CSH2', ${data.amount}, ${data.amount/reservePrice}, ${reservePrice}, 'Monthly contribution')
    `;
    return Response.json({ok:true});
  } catch(error) {
    if(error instanceof z.ZodError) return Response.json({error:"Enter a valid contribution amount."},{status:400});
    return Response.json({error:"Could not record contribution."},{status:500});
  }
}