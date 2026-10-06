import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";

const schema=z.object({
  planSlug:z.string().min(1).max(60),
  currency:z.string().length(3),
  cadence:z.enum(["MONTHLY","ANNUAL"]),
  amountMinor:z.number().int().nonnegative(),
  stripePriceId:z.string().nullable().optional(),
  active:z.boolean().default(true)
});

export async function PUT(request:Request){
  try{
    assertSameOrigin(request);
    const admin=await requireAdmin();
    const p=schema.parse(await request.json());
    const currency=p.currency.toUpperCase();
    const plans=await sql.unsafe("SELECT id,supported_billing_currencies FROM plans WHERE slug=$1 LIMIT 1",[p.planSlug]);
    if(!plans[0])return Response.json({error:"Plan not found."},{status:404});

    await sql.begin(async(tx)=>{
      await tx.unsafe(
        "INSERT INTO plan_prices (plan_id,currency,cadence,amount_minor,stripe_price_id,active) VALUES ($1,$2,$3,$4,$5,$6)"+
        " ON CONFLICT (plan_id,currency,cadence) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,stripe_price_id=EXCLUDED.stripe_price_id,active=EXCLUDED.active,updated_at=now()",
        [plans[0].id,currency,p.cadence,p.amountMinor,p.stripePriceId?.trim()||null,p.active]
      );

      const supported=Array.isArray(plans[0].supported_billing_currencies)
        ? plans[0].supported_billing_currencies.map(String).map((value:string)=>value.toUpperCase())
        : [];
      if(!supported.includes(currency)){
        supported.push(currency);
        await tx.unsafe(
          "UPDATE plans SET supported_billing_currencies=$1::jsonb,updated_at=now() WHERE id=$2",
          [JSON.stringify(supported),plans[0].id]
        );
      }

      await tx.unsafe(
        "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'plan-price.upsert','plan',$2,$3::jsonb)",
        [admin.id,p.planSlug,JSON.stringify({currency,cadence:p.cadence,active:p.active})]
      );
    });
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Invalid plan price."},{status:400});
    return Response.json({error:"Could not update plan price."},{status:500});
  }
}
