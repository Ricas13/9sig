import Stripe from "stripe";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";

const schema=z.object({planSlug:z.enum(["investor","pro"]),cadence:z.enum(["monthly","annual"])});

export async function POST(request:Request){
  try{
    const user=await requireUser();
    const input=schema.parse(await request.json());
    if(!process.env.STRIPE_SECRET_KEY||!process.env.NEXT_PUBLIC_APP_URL)return Response.json({error:"Billing is not configured."},{status:503});
    const planRows=await sql.unsafe("SELECT id,stripe_monthly_price_id,stripe_annual_price_id FROM plans WHERE slug=$1 AND archived=false AND visible=true LIMIT 1",[input.planSlug]);
    const plan=planRows[0];if(!plan)return Response.json({error:"Plan is unavailable."},{status:404});
    const priceId=input.cadence==="annual"?plan.stripe_annual_price_id:plan.stripe_monthly_price_id;
    if(!priceId)return Response.json({error:"Stripe price is not configured for this plan."},{status:503});
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
    const subRows=await sql.unsafe("SELECT stripe_customer_id,stripe_subscription_id,status FROM subscriptions WHERE user_id=$1 LIMIT 1",[user.id]);
    const local=subRows[0];
    if(local?.stripe_subscription_id&& !["FREE","CANCELED"].includes(String(local.status))){
      return Response.json({error:"You already have a Stripe subscription. Use Manage billing to change the plan or billing cycle."},{status:409});
    }
    let customerId=local?.stripe_customer_id?String(local.stripe_customer_id):null;
    if(!customerId){
      const customer=await stripe.customers.create({email:user.email,metadata:{userId:user.id}},{idempotencyKey:"strategyos-customer-"+user.id});
      customerId=customer.id;
      await sql.unsafe("UPDATE subscriptions SET stripe_customer_id=$1,updated_at=now() WHERE user_id=$2 AND stripe_customer_id IS NULL",[customerId,user.id]);
      const canonical=await sql.unsafe("SELECT stripe_customer_id FROM subscriptions WHERE user_id=$1 LIMIT 1",[user.id]);
      customerId=canonical[0]?.stripe_customer_id?String(canonical[0].stripe_customer_id):customerId;
    }
    const hourBucket=Math.floor(Date.now()/3600000);
    const session=await stripe.checkout.sessions.create({
      mode:"subscription",customer:customerId,client_reference_id:user.id,line_items:[{price:String(priceId),quantity:1}],
      success_url:process.env.NEXT_PUBLIC_APP_URL+"/app/settings?billing=success",
      cancel_url:process.env.NEXT_PUBLIC_APP_URL+"/app/settings?billing=cancelled",
      subscription_data:{metadata:{userId:user.id,planId:String(plan.id)}},
      metadata:{userId:user.id,planId:String(plan.id),cadence:input.cadence}
    },{idempotencyKey:["strategyos-checkout",user.id,String(plan.id),input.cadence,String(hourBucket)].join("-")});
    return Response.json({url:session.url});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:"Choose a valid plan."},{status:400});
    return Response.json({error:"Could not start checkout."},{status:500});
  }
}
