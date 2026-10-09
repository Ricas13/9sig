import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";
import { authFailure } from "@/lib/api-auth";

const schema=z.object({
  planSlug:z.string().min(1).max(60),
  currency:z.string().length(3),
  cadence:z.enum(["MONTHLY","ANNUAL"]),
  amountMinor:z.number().int().nonnegative(),
  stripePriceId:z.string().nullable().optional(),
  appleProductId:z.string().trim().max(200).regex(/^[A-Za-z0-9._-]+$/).nullable().optional(),
  googleProductId:z.string().trim().max(200).regex(/^[A-Za-z0-9._:-]+$/).nullable().optional(),
  active:z.boolean().default(true)
});

export async function PUT(request:Request){
  try{assertSameOrigin(request);const admin=await requireAdmin();
    const p=schema.parse(await request.json());
    const plans=await sql.unsafe("SELECT id FROM plans WHERE slug=$1 LIMIT 1",[p.planSlug]);
    if(!plans[0])return Response.json({error:"Plan not found."},{status:404});
    await sql.unsafe(
      "INSERT INTO plan_prices (plan_id,currency,cadence,amount_minor,stripe_price_id,active,apple_product_id,google_product_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)"+
      " ON CONFLICT (plan_id,currency,cadence) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,stripe_price_id=EXCLUDED.stripe_price_id,active=EXCLUDED.active,apple_product_id=EXCLUDED.apple_product_id,google_product_id=EXCLUDED.google_product_id,updated_at=now()",
      [plans[0].id,p.currency.toUpperCase(),p.cadence,p.amountMinor,p.stripePriceId??null,p.active,p.appleProductId||null,p.googleProductId||null]
    );
    await sql.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'plan-price.upsert','plan',$2,$3::jsonb)",[admin.id,p.planSlug,JSON.stringify({currency:p.currency.toUpperCase(),cadence:p.cadence})]);
    return Response.json({ok:true});
  }catch(error){const denied=authFailure(error);if(denied)return denied;
    if(error instanceof z.ZodError)return Response.json({error:"Invalid plan price."},{status:400});
    if(error instanceof Error&&/plan_price_(apple|google)_unique/.test(error.message))return Response.json({error:"That store product is already assigned to another price."},{status:409});
    return Response.json({error:"Could not update plan price."},{status:500});
  }
}
