import { z } from "zod";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/request-user";

const schema=z.object({growthPrice:z.coerce.number().positive(),reservePrice:z.coerce.number().positive()});

export async function POST(request:Request) {
  try {
    const {portfolio}=await requireUser(); const data=schema.parse(await request.json());
    await sql`UPDATE portfolios SET manual_growth_price=${data.growthPrice}, manual_reserve_price=${data.reservePrice}, updated_at=now() WHERE id=${portfolio.id}`;
    return Response.json({ok:true});
  } catch { return Response.json({error:"Could not save prices."},{status:400}); }
}
export async function DELETE() {
  try {
    const {portfolio}=await requireUser();
    await sql`UPDATE portfolios SET manual_growth_price=NULL, manual_reserve_price=NULL, updated_at=now() WHERE id=${portfolio.id}`;
    return Response.json({ok:true});
  } catch { return Response.json({error:"Could not clear prices."},{status:400}); }
}