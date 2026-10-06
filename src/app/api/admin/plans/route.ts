import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { sql } from "@/lib/db";

const schema=z.object({
  slug:z.string().min(1).max(60),
  displayName:z.string().min(1),
  description:z.string().default(""),
  monthlyPriceMinor:z.number().int().nonnegative(),
  annualPriceMinor:z.number().int().nonnegative(),
  annualDiscountBps:z.number().int().min(0).max(10000).default(0),
  currency:z.string().length(3),
  supportedBillingCurrencies:z.array(z.string().length(3)).min(1),
  maxActiveStrategies:z.number().int().positive().nullable(),
  availableStrategyKeys:z.array(z.string()).default([]),
  entitlements:z.record(z.string(),z.unknown()).default({}),
  trialDays:z.number().int().nonnegative().default(0),
  delinquencyGraceDays:z.number().int().min(0).max(30).default(3),
  visible:z.boolean().default(true),
  archived:z.boolean().default(false),
  sortOrder:z.number().int().default(0)
});

export async function PUT(request:Request){
  try{
    assertSameOrigin(request);
    const admin=await requireAdmin();
    const p=schema.parse(await request.json());
    const supported=[...new Set(p.supportedBillingCurrencies.map((x)=>x.toUpperCase()))];
    const primary=p.currency.toUpperCase();
    if(!supported.includes(primary))supported.unshift(primary);

    await sql.unsafe(
      "INSERT INTO plans (slug,display_name,description,monthly_price_minor,annual_price_minor,annual_discount_bps,billing_currency,supported_billing_currencies,max_active_strategies,available_strategy_keys,entitlements,trial_days,delinquency_grace_days,visible,archived,sort_order)" +
      " VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16)" +
      " ON CONFLICT (slug) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,monthly_price_minor=EXCLUDED.monthly_price_minor,annual_price_minor=EXCLUDED.annual_price_minor,annual_discount_bps=EXCLUDED.annual_discount_bps,billing_currency=EXCLUDED.billing_currency,supported_billing_currencies=EXCLUDED.supported_billing_currencies,max_active_strategies=EXCLUDED.max_active_strategies,available_strategy_keys=EXCLUDED.available_strategy_keys,entitlements=EXCLUDED.entitlements,trial_days=EXCLUDED.trial_days,delinquency_grace_days=EXCLUDED.delinquency_grace_days,visible=EXCLUDED.visible,archived=EXCLUDED.archived,sort_order=EXCLUDED.sort_order,updated_at=now()",
      [p.slug,p.displayName,p.description,p.monthlyPriceMinor,p.annualPriceMinor,p.annualDiscountBps,primary,JSON.stringify(supported),p.maxActiveStrategies,JSON.stringify(p.availableStrategyKeys),JSON.stringify(p.entitlements),p.trialDays,p.delinquencyGraceDays,p.visible,p.archived,p.sortOrder]
    );
    await sql.unsafe(
      "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,'plan.upsert','plan',$2,$3::jsonb)",
      [admin.id,p.slug,JSON.stringify({delinquencyGraceDays:p.delinquencyGraceDays})]
    );
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Invalid plan configuration."},{status:400});
    return Response.json({error:"Could not update plan."},{status:500});
  }
}
