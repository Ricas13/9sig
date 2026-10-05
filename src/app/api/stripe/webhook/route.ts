import Stripe from "stripe";
import { sql } from "@/lib/db";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) return new Response("Billing not configured", { status: 503 });
  const stripe = new Stripe(secret);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret); }
  catch { return new Response("Invalid signature", { status: 400 }); }

  const sync = async (subscription: Stripe.Subscription) => {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    await sql`
      UPDATE users SET stripe_subscription_id=${subscription.id}, subscription_status=${subscription.status}, updated_at=now()
      WHERE stripe_customer_id=${customerId}
    `;
  };
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    await sync(event.data.object as Stripe.Subscription);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.customer && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(String(session.subscription));
      await sync(sub);
    }
  }
  return Response.json({ received: true });
}