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
  // Never promote a subscription from mutable metadata when its Stripe Price
  // is not mapped to a published local product.
  return null;
}

async function retrieveCurrentSubscription(stripe:Stripe,subscriptionId:string){
  try{
    return await stripe.subscriptions.retrieve(subscriptionId);
  }catch(retrieveError){
    // A subscription Stripe no longer knows about (for example after its customer was
    // deleted) has ended; callers treat null as "ended" rather than retrying forever.
    if((retrieveError as {code?:string})?.code==="resource_missing")return null;
    throw retrieveError;
  }
}

async function resolveSubscriptionUserId(subscription:Stripe.Subscription){
  const customerId=typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id;
  if(!customerId)throw new Error("STRIPE_CUSTOMER_MISSING");
  const bySubscription=await sql.unsafe(
    "SELECT DISTINCT user_id FROM subscriptions WHERE stripe_subscription_id=$1 LIMIT 2",
    [subscription.id]
  );
  const byCustomer=await sql.unsafe(
    "SELECT DISTINCT user_id FROM subscriptions WHERE stripe_customer_id=$1 LIMIT 2",
    [customerId]
  );
  if(bySubscription.length>1||byCustomer.length>1)throw new Error("AMBIGUOUS_SUBSCRIPTION_OWNER");
  const subscriptionUser=bySubscription[0]?String(bySubscription[0].user_id):null;
  const customerUser=byCustomer[0]?String(byCustomer[0].user_id):null;
  if(subscriptionUser&&customerUser&&subscriptionUser!==customerUser)
    throw new Error("SUBSCRIPTION_CUSTOMER_OWNERSHIP_CONFLICT");
  const canonical=subscriptionUser??customerUser;
  if(!canonical)throw new Error("SUBSCRIPTION_OWNER_NOT_VERIFIED");
  if(subscription.metadata.userId&&subscription.metadata.userId!==canonical)
    throw new Error("STRIPE_METADATA_OWNER_MISMATCH");
  return canonical;
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
      const incoming=event.data.object as Stripe.Subscription;
      // Serialize each subscription before fetching canonical Stripe state.
      // Replayed or out-of-order events can only ever apply the current state.
      const outcome=await sql.begin(async(tx)=>{
        await tx.unsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,1))",[incoming.id]);
        const canonical=await retrieveCurrentSubscription(stripe,incoming.id);
        const subject=canonical??incoming;
        const userId=await resolveSubscriptionUserId(subject);
        const rows=await tx.unsafe(
          "SELECT stripe_subscription_id,stripe_customer_id,status FROM subscriptions WHERE user_id=$1 FOR UPDATE",
          [userId]
        );
        if(!rows[0])throw new Error("LOCAL_BILLING_OWNER_MISSING");
        const customerId=typeof subject.customer==="string"?subject.customer:subject.customer?.id;
        if(rows[0].stripe_customer_id!==customerId)
          throw new Error("SUBSCRIPTION_CUSTOMER_OWNERSHIP_CONFLICT");
        const current=rows[0].stripe_subscription_id?String(rows[0].stripe_subscription_id):null;

        // Ended subscriptions are handled before duplicate detection: they must never be
        // "cancelled as a duplicate" again, and a late event must never revive them.
        if(!canonical||isTerminalStripeStatus(canonical.status)){
          if(current===incoming.id){
            await tx.unsafe(
              "UPDATE subscriptions SET status='FREE',cadence='FREE',stripe_subscription_id=NULL,"+
              "current_period_end=NULL,cancel_at_period_end=false,plan_id=(SELECT id FROM plans WHERE slug='free' LIMIT 1),updated_at=now() "+
              "WHERE user_id=$1 AND stripe_subscription_id=$2",
              [userId,incoming.id]
            );
            return {userId,duplicate:null};
          }
          return {userId:null as string|null,duplicate:null};
        }

        // A stored subscription that is already dead (re-subscribing after a cancellation)
        // must not block its replacement, otherwise the new paid subscription is cancelled.
        if(current&&current!==canonical.id&&!isTerminalLocalStatus(rows[0].status))
          return {userId:null as string|null,duplicate:event.type==="customer.subscription.created"?canonical.id:null};

        // Only permit grants for a mapped Stripe Price, not planId metadata.
        const planId=await resolvePlanId(canonical);
        if(!planId)throw new Error("PLAN_NOT_RESOLVED");
        const item=canonical.items.data[0];
        if(!item?.price?.recurring)throw new Error("STRIPE_RECURRING_PRICE_MISSING");
        const status=canonical.status==="active"?"ACTIVE":canonical.status==="trialing"?"TRIALING":canonical.status.toUpperCase();
        // Newer Stripe API versions report the billing period per item, older ones on the
        // subscription. Renewals must keep moving the period end whichever the payload uses.
        const periodEnd=item.current_period_end??(canonical as unknown as {current_period_end?:number}).current_period_end??null;
        await tx.unsafe(
          "UPDATE subscriptions SET plan_id=$1,status=$2,cadence=$3,stripe_subscription_id=$4,"+
          "current_period_end=$5,cancel_at_period_end=$6,updated_at=now() WHERE user_id=$7",
          [planId,status,item.price.recurring.interval==="year"?"ANNUAL":"MONTHLY",
            canonical.id,periodEnd?new Date(periodEnd*1000):null,
            canonical.cancel_at_period_end,userId]
        );
        return {userId,duplicate:null};
      });
      affectedUserId=outcome.userId;
      duplicateSubscriptionId=outcome.duplicate;
    }

    if(duplicateSubscriptionId){
      const cancelled=await stripe.subscriptions.cancel(duplicateSubscriptionId);
      // Cancelling stops further charges but does not return a payment already taken for the
      // duplicate. Refunds move money, so a person decides; the audit row carries what they need.
      const latestInvoice=cancelled?.latest_invoice;
      await sql.unsafe(
        "INSERT INTO audit_events (action,entity_type,entity_id,metadata) VALUES ('billing.duplicate-subscription-cancelled','stripe_subscription',$1,$2::jsonb)",
        [duplicateSubscriptionId,JSON.stringify({
          eventId:event.id,
          requiresRefundReview:true,
          customerId:typeof cancelled?.customer==="string"?cancelled.customer:cancelled?.customer?.id??null,
          latestInvoiceId:typeof latestInvoice==="string"?latestInvoice:latestInvoice?.id??null
        })]
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
