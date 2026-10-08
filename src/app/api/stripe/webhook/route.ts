import Stripe from "stripe";
import { sql } from "@/lib/db";
import { enforceStrategyEntitlements } from "@/lib/entitlement-service";
import { isTerminalLocalStatus, isTerminalStripeStatus } from "@/domain/subscription-status";

async function claimWebhookEvent(event: Stripe.Event) {
  const inserted=await sql.unsafe(
    "INSERT INTO billing_webhook_events (event_id,event_type,status) VALUES ($1,$2,'PROCESSING') ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
    [event.id,event.type]
  );
  if(inserted[0])return true;
  const existing=await sql.unsafe("SELECT status,created_at FROM billing_webhook_events WHERE event_id=$1 LIMIT 1",[event.id]);
  const status=String(existing[0]?.status??"");
  if(status==="SUCCESS")return false;
  if(status==="PROCESSING"&&existing[0]?.created_at&&Date.now()-new Date(existing[0].created_at).getTime()<5*60*1000){
    throw new Error("WEBHOOK_ALREADY_PROCESSING");
  }
  await sql.unsafe("UPDATE billing_webhook_events SET status='PROCESSING',last_error_code=NULL,created_at=now(),processed_at=NULL WHERE event_id=$1",[event.id]);
  return true;
}

async function markWebhookEvent(eventId:string,status:"SUCCESS"|"FAILED",errorCode?:string){
  await sql.unsafe(
    "UPDATE billing_webhook_events SET status=$1,processed_at=CASE WHEN $1='SUCCESS' THEN now() ELSE processed_at END,last_error_code=$2 WHERE event_id=$3",
    [status,errorCode??null,eventId]
  );
}

async function resolvePlanId(subscription: Stripe.Subscription) {
  const priceId=subscription.items.data[0]?.price.id;
  if(priceId){
    const byPrice=await sql.unsafe(
      "SELECT DISTINCT p.id FROM plan_prices pp JOIN plans p ON p.id=pp.plan_id WHERE pp.stripe_price_id=$1 LIMIT 2",
      [priceId]
    );
    if(byPrice.length>1)throw new Error("AMBIGUOUS_STRIPE_PRICE");
    if(byPrice[0])return String(byPrice[0].id);

    const legacy=await sql.unsafe(
      "SELECT id FROM plans WHERE stripe_monthly_price_id=$1 OR stripe_annual_price_id=$1 LIMIT 2",
      [priceId]
    );
    if(legacy.length>1)throw new Error("AMBIGUOUS_STRIPE_PRICE");
    if(legacy[0])return String(legacy[0].id);
  }
  // The metadata fallback is only trusted when it names a real plan; an unknown id
  // would otherwise fail a foreign key and make Stripe retry the event forever.
  const metadataPlanId=subscription.metadata.planId;
  if(metadataPlanId){
    const known=await sql.unsafe("SELECT id FROM plans WHERE id::text=$1 LIMIT 1",[metadataPlanId]);
    if(known[0])return String(known[0].id);
  }
  return null;
}

async function retrieveCurrentSubscription(stripe:Stripe,subscriptionId:string){
  try{
    return await stripe.subscriptions.retrieve(subscriptionId);
  }catch(retrieveError){
    if((retrieveError as {code?:string})?.code==="resource_missing")return null;
    throw retrieveError;
  }
}

async function resetToFree(userId:string,subscriptionId:string){
  const updated=await sql.unsafe(
    "UPDATE subscriptions SET status='FREE',cadence='FREE',stripe_subscription_id=NULL,current_period_end=NULL,cancel_at_period_end=false,plan_id=(SELECT id FROM plans WHERE slug='free' LIMIT 1),updated_at=now() WHERE user_id=$1 AND stripe_subscription_id=$2 RETURNING user_id",
    [userId,subscriptionId]
  );
  return Boolean(updated[0]);
}

async function resolveSubscriptionUserId(subscription:Stripe.Subscription){
  if(subscription.metadata.userId)return subscription.metadata.userId;

  const bySubscription=await sql.unsafe(
    "SELECT user_id FROM subscriptions WHERE stripe_subscription_id=$1 LIMIT 2",
    [subscription.id]
  );
  if(bySubscription.length>1)throw new Error("AMBIGUOUS_SUBSCRIPTION_OWNER");
  if(bySubscription[0])return String(bySubscription[0].user_id);

  const customerId=typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id;
  if(!customerId)return null;
  const byCustomer=await sql.unsafe(
    "SELECT user_id FROM subscriptions WHERE stripe_customer_id=$1 LIMIT 2",
    [customerId]
  );
  if(byCustomer.length>1)throw new Error("AMBIGUOUS_SUBSCRIPTION_OWNER");
  return byCustomer[0]?String(byCustomer[0].user_id):null;
}

export async function POST(request:Request){
  const secret=process.env.STRIPE_SECRET_KEY;
  const webhookSecret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!secret||!webhookSecret)return new Response("Billing not configured",{status:503});
  const signature=request.headers.get("stripe-signature");
  if(!signature)return new Response("Missing signature",{status:400});
  const stripe=new Stripe(secret);
  let event:Stripe.Event;
  try{event=stripe.webhooks.constructEvent(await request.text(),signature,webhookSecret);}
  catch{return new Response("Invalid signature",{status:400});}

  try{
    const shouldProcess=await claimWebhookEvent(event);
    if(!shouldProcess)return Response.json({received:true,duplicate:true});

    let affectedUserId:string|null=null;
    let duplicateSubscriptionId:string|null=null;

    if(event.type.startsWith("customer.subscription.")){
      const eventSubscription=event.data.object as Stripe.Subscription;
      const userId=await resolveSubscriptionUserId(eventSubscription);
      if(userId){
        // Events can arrive late or out of order, so the payload may describe a state the
        // subscription has already left (for example "active" after it was deleted).
        // Entitlements are only ever granted from Stripe's current view of it.
        const subscription=event.type==="customer.subscription.deleted"
          ?null
          :await retrieveCurrentSubscription(stripe,eventSubscription.id);
        if(!subscription||isTerminalStripeStatus(subscription.status)){
          if(await resetToFree(userId,eventSubscription.id))affectedUserId=userId;
        }else{
          const planId=await resolvePlanId(subscription);
          if(!planId)throw new Error("PLAN_NOT_RESOLVED");
          const decision=await sql.begin(async(tx)=>{
            const rows=await tx.unsafe("SELECT stripe_subscription_id,status FROM subscriptions WHERE user_id=$1 FOR UPDATE",[userId]);
            if(!rows[0])return {duplicate:true,orphan:true};
            const canonical=rows[0].stripe_subscription_id?String(rows[0].stripe_subscription_id):null;
            // A stored subscription that is already dead (re-subscribing after a cancellation)
            // must not block its replacement, otherwise the new paid subscription is cancelled.
            if(canonical&&canonical!==subscription.id&&!isTerminalLocalStatus(rows[0].status))return {duplicate:true};
            const status=subscription.status==="active"?"ACTIVE":subscription.status==="trialing"?"TRIALING":subscription.status.toUpperCase();
            const item=subscription.items.data[0];
            // Newer Stripe API versions report the billing period per item, older ones on the
            // subscription. Renewals must keep moving the period end whichever the payload uses.
            const periodEnd=item?.current_period_end??(subscription as unknown as {current_period_end?:number}).current_period_end??null;
            await tx.unsafe(
              "UPDATE subscriptions SET plan_id=$1,status=$2,cadence=$3,stripe_subscription_id=$4,current_period_end=$5,cancel_at_period_end=$6,updated_at=now() WHERE user_id=$7",
              [planId,status,item?.price.recurring?.interval==="year"?"ANNUAL":"MONTHLY",subscription.id,periodEnd?new Date(periodEnd*1000):null,subscription.cancel_at_period_end,userId]
            );
            return {duplicate:false};
          });
          if(decision.duplicate){
            if(event.type==="customer.subscription.created"||("orphan" in decision&&decision.orphan))duplicateSubscriptionId=subscription.id;
          }else affectedUserId=userId;
        }
      }
    }

    if(duplicateSubscriptionId){
      await stripe.subscriptions.cancel(duplicateSubscriptionId);
      await sql.unsafe(
        "INSERT INTO audit_events (action,entity_type,entity_id,metadata) VALUES ('billing.duplicate-subscription-cancelled','stripe_subscription',$1,$2::jsonb)",
        [duplicateSubscriptionId,JSON.stringify({eventId:event.id})]
      );
    }
    if(affectedUserId)await enforceStrategyEntitlements(affectedUserId);

    await markWebhookEvent(event.id,"SUCCESS");
    return Response.json({received:true});
  }catch(error){
    const code=error instanceof Error?error.message:"WEBHOOK_FAILED";
    if(code==="WEBHOOK_ALREADY_PROCESSING"){
      return new Response("Webhook is already being processed",{status:503});
    }
    await markWebhookEvent(event.id,"FAILED",code).catch(()=>{});
    return new Response("Webhook processing failed",{status:500});
  }
}
