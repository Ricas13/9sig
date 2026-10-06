import Stripe from "stripe";
import { sql } from "@/lib/db";
import { enforceStrategyEntitlements } from "@/lib/entitlement-service";

async function claimWebhookEvent(event: Stripe.Event) {
  const inserted = await sql.unsafe(
    "INSERT INTO billing_webhook_events (event_id,event_type,status) VALUES ($1,$2,'PROCESSING') ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
    [event.id, event.type]
  );
  if (inserted[0]) return true;
  const existing = await sql.unsafe("SELECT status,created_at FROM billing_webhook_events WHERE event_id=$1 LIMIT 1", [event.id]);
  const status = String(existing[0]?.status ?? "");
  if (status === "SUCCESS") return false;
  if (status === "PROCESSING" && existing[0]?.created_at && Date.now() - new Date(existing[0].created_at).getTime() < 5 * 60 * 1000) {
    throw new Error("WEBHOOK_ALREADY_PROCESSING");
  }
  await sql.unsafe(
    "UPDATE billing_webhook_events SET status='PROCESSING',last_error_code=NULL,created_at=now(),processed_at=NULL WHERE event_id=$1",
    [event.id]
  );
  return true;
}

async function markWebhookEvent(eventId: string, status: "SUCCESS" | "FAILED", errorCode?: string) {
  await sql.unsafe(
    "UPDATE billing_webhook_events SET status=$1,processed_at=CASE WHEN $1='SUCCESS' THEN now() ELSE processed_at END,last_error_code=$2 WHERE event_id=$3",
    [status, errorCode ?? null, eventId]
  );
}

function subscriptionCustomerId(subscription: Stripe.Subscription) {
  return typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
}

async function resolveUserId(subscription: Stripe.Subscription) {
  if (subscription.metadata.userId) return subscription.metadata.userId;
  const rows = await sql.unsafe(
    "SELECT user_id FROM subscriptions WHERE stripe_subscription_id=$1 OR stripe_customer_id=$2 LIMIT 1",
    [subscription.id, subscriptionCustomerId(subscription)]
  );
  return rows[0]?.user_id ? String(rows[0].user_id) : null;
}

async function resolvePlanId(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  if (priceId) {
    let byPrice = await sql.unsafe(
      "SELECT p.id FROM plan_prices pp JOIN plans p ON p.id=pp.plan_id WHERE pp.stripe_price_id=$1 LIMIT 1",
      [priceId]
    );
    if (!byPrice[0]) {
      byPrice = await sql.unsafe(
        "SELECT id FROM plans WHERE stripe_monthly_price_id=$1 OR stripe_annual_price_id=$1 LIMIT 1",
        [priceId]
      );
    }
    if (byPrice[0]) return String(byPrice[0].id);
  }
  return subscription.metadata.planId || null;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) return new Response("Billing not configured", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const stripe = new Stripe(secret);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const shouldProcess = await claimWebhookEvent(event);
    if (!shouldProcess) return Response.json({ received: true, duplicate: true });

    let affectedUserId: string | null = null;
    let duplicateSubscriptionId: string | null = null;

    if (event.type.startsWith("customer.subscription.")) {
      const payload = event.data.object as Stripe.Subscription;
      const isDeleted = event.type === "customer.subscription.deleted";
      const subscription = isDeleted ? payload : await stripe.subscriptions.retrieve(payload.id);
      const userId = await resolveUserId(subscription);

      if (userId) {
        if (isDeleted) {
          const updated = await sql.unsafe(
            "UPDATE subscriptions SET status='FREE',cadence='FREE',stripe_subscription_id=NULL,current_period_end=NULL,cancel_at_period_end=false,billing_grace_until=NULL,plan_id=(SELECT id FROM plans WHERE slug='free' LIMIT 1),updated_at=now() WHERE user_id=$1 AND stripe_subscription_id=$2 RETURNING user_id",
            [userId, subscription.id]
          );
          if (updated[0]) affectedUserId = userId;
        } else {
          const planId = await resolvePlanId(subscription);
          if (!planId) throw new Error("PLAN_NOT_RESOLVED");

          const decision = await sql.begin(async (tx) => {
            const rows = await tx.unsafe(
              "SELECT stripe_subscription_id,status,billing_grace_until FROM subscriptions WHERE user_id=$1 FOR UPDATE",
              [userId]
            );
            if (!rows[0]) return { duplicate: true, orphan: true };

            const canonical = rows[0].stripe_subscription_id ? String(rows[0].stripe_subscription_id) : null;
            if (canonical && canonical !== subscription.id) return { duplicate: true, orphan: false };

            const status =
              subscription.status === "active" ? "ACTIVE" :
              subscription.status === "trialing" ? "TRIALING" :
              subscription.status.toUpperCase();
            const item = subscription.items.data[0];

            let graceUntil: Date | null = null;
            if (status === "PAST_DUE") {
              if (String(rows[0].status) === "PAST_DUE" && rows[0].billing_grace_until) {
                graceUntil = new Date(rows[0].billing_grace_until);
              } else {
                const planRows = await tx.unsafe("SELECT delinquency_grace_days FROM plans WHERE id=$1 LIMIT 1", [planId]);
                const days = Math.max(0, Math.min(30, Number(planRows[0]?.delinquency_grace_days ?? 3)));
                graceUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
              }
            }

            await tx.unsafe(
              "UPDATE subscriptions SET plan_id=$1,status=$2,cadence=$3,stripe_customer_id=COALESCE(stripe_customer_id,$4),stripe_subscription_id=$5,current_period_end=$6,cancel_at_period_end=$7,billing_grace_until=$8,updated_at=now() WHERE user_id=$9",
              [
                planId,
                status,
                item?.price.recurring?.interval === "year" ? "ANNUAL" : "MONTHLY",
                subscriptionCustomerId(subscription),
                subscription.id,
                item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
                subscription.cancel_at_period_end,
                graceUntil,
                userId
              ]
            );
            return { duplicate: false, orphan: false };
          });

          if (decision.duplicate) {
            if (subscription.status !== "canceled") duplicateSubscriptionId = subscription.id;
          } else {
            affectedUserId = userId;
          }
        }
      } else if (!isDeleted && subscription.status !== "canceled") {
        duplicateSubscriptionId = subscription.id;
      }
    }

    if (duplicateSubscriptionId) {
      await stripe.subscriptions.cancel(duplicateSubscriptionId);
      await sql.unsafe(
        "INSERT INTO audit_events (action,entity_type,entity_id,metadata) VALUES ('billing.duplicate-subscription-cancelled','stripe_subscription',$1,$2::jsonb)",
        [duplicateSubscriptionId, JSON.stringify({ eventId: event.id })]
      );
    }

    if (affectedUserId) await enforceStrategyEntitlements(affectedUserId);
    await markWebhookEvent(event.id, "SUCCESS");
    return Response.json({ received: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WEBHOOK_FAILED";
    await markWebhookEvent(event.id, "FAILED", code).catch(() => {});
    return new Response("Webhook processing failed", { status: 500 });
  }
}
