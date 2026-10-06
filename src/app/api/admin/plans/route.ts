import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";

const schema=z.object({
  slug:z.string().min(1).max(60),displayName:z.string().min(1),description:z.string().default(""),
  monthlyPriceMinor:z.number().int().nonnegative(),annualPriceMinor:z.number().int().nonnegative(),
  annualDiscountBps:z.number().int().min(0).max(10000).default(0),
  currency:z.string().length(3),supportedBillingCurrencies:z.array(z.string().length(3)).min(1),
  maxActiveStrategies:z.number().int().positive().nullable(),availableStrategyKeys:z.array(z.string()).default([]),
  stripeMonthlyPriceId:z.string().nullable().optional(),stripeAnnualPriceId:z.string().nullable().optional(),
  entitlements:z.record(z.string(),z.unknown()).default({}),trialDays:z.number().int().nonnegative().default(0),
  visible:z.boolean().default(true),archived:z.boolean().default(false),sortOrder:z.number().int().default(0)
});
export async function PUT(request:Request){
  try{assertSameOrigin(request);const admin=await requireAdmin();const p=schema.parse(await request.json());
    await sql.unsafe(
      "INSERT INTO plans (slug,display_name,description,monthly_price_minor,annual_price_minor,annual_discount_bps,billing_currency,supported_billing_currencies,max_active_strategies,available_strategy_keys,stripe_monthly_price_id,stripe_annual_price_id,entitlements,trial_days,visible,archived,sort_order)" +
      " VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16,$17)" +
      " ON CONFLICT (slug) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,monthly_price_minor=EXCLUDED.monthly_price_minor,annual_price_minor=EXCLUDED.annual_price_minor,annual_discount_bps=EXCLUDED.annual_discount_bps,billing_currency=EXCLUDED.billing_currency,supported_billing_currencies=EXCLUDED.supported_billing_currencies,max_active_strategies=EXCLUDED.max_active_strategies,available_strategy_keys=EXCLUDED.available_strategy_keys,stripe_monthly_price_id=EXCLUDED.stripe_monthly_price_id,stripe_annual_price_id=EXCLUDED.stripe_annual_price_id,entitlements=EXCLUDED.entitlements,trial_days=EXCLUDED.trial_days,visible=EXCLUDED.visible,archived=EXCLUDED.archived,sort_order=EXCLUDED.sort_order,updated_at=now()",
      [p.slug,p.displayName,p.description,p.monthlyPriceMinor,p.annualPriceMinor,p.annualDiscountBps,p.currency.toUpperCase(),JSON.stringify(p.supportedBillingCurrencies.map(x=>x.toUpperCase())),p.maxActiveStrategies,JSON.stringify(p.availableStrategyKeys),p.stripeMonthlyPriceId??null,p.stripeAnnualPriceId??null,JSON.stringify(p.entitlements),p.trialDays,p.visible,p.archived,p.sortOrder]
    );
    await sql.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id) VALUES ($1,'plan.upsert','plan',$2)",[admin.id,p.slug]);
    return Response.json({ok:true});
  }catch(error){if(error instanceof z.ZodError)return Response.json({error:"Invalid plan configuration."},{status:400});return Response.json({error:"Could not update plan."},{status:500});}
}
