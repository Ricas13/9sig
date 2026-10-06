import Stripe from "stripe";
import { sql } from "@/lib/db";

export async function POST(request: Request) {
  const secret=process.env.STRIPE_SECRET_KEY;
  const webhookSecret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!secret || !webhookSecret) return new Response("Billing not configured",{status:503});
  const signature=request.headers.get("stripe-signature");
  if(!signature) return new Response("Missing signature",{status:400});
  const stripe=new Stripe(secret);
  let event: Stripe.Event;
  try {
    event=stripe.webhooks.constructEvent(await request.text(),signature,webhookSecret);
  } catch {
    return new Response("Invalid signature",{status:400});
  }

  try {
    if(event.type.startsWith("customer.subscription.")) {
      const subscription=event.data.object as Stripe.Subscription;
      const userId=subscription.metadata.userId;
      const planId=subscription.metadata.planId;
      if(userId && planId) {
        const status = subscription.status === "active" ? "ACTIVE" : subscription.status === "trialing" ? "TRIALING" : subscription.status.toUpperCase();
        await sql.unsafe(
          "UPDATE subscriptions SET plan_id=$1,status=$2,cadence=$3,stripe_subscription_id=$4,current_period_end=to_timestamp($5),cancel_at_period_end=$6,updated_at=now() WHERE user_id=$7",
          [planId,status,subscription.items.data[0]?.price.recurring?.interval === "year" ? "ANNUAL" : "MONTHLY",subscription.id,subscription.items.data[0]?.current_period_end ?? null,subscription.cancel_at_period_end,userId]
        );
      }
    }
    if(event.type==="customer.subscription.deleted") {
      const subscription=event.data.object as Stripe.Subscription;
      const userId=subscription.metadata.userId;
      if(userId) {
        const free=await sql.unsafe("SELECT id FROM plans WHERE slug='free' LIMIT 1");
        if(free[0]) await sql.unsafe("UPDATE subscriptions SET plan_id=$1,status='FREE',cadence='FREE',stripe_subscription_id=NULL,current_period_end=NULL,cancel_at_period_end=false,updated_at=now() WHERE user_id=$2",[free[0].id,userId]);
      }
    }
    return Response.json({received:true});
  } catch {
    return new Response("Webhook processing failed",{status:500});
  }
}
