import Stripe from "stripe";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";

const schema = z.object({
  planSlug: z.enum(["investor", "pro"]),
  cadence: z.enum(["monthly", "annual"]),
  currency: z.string().length(3).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());

    if (!process.env.STRIPE_SECRET_KEY || !process.env.NEXT_PUBLIC_APP_URL) {
      return Response.json({ error: "Billing is not configured." }, { status: 503 });
    }

    const currency = (input.currency ?? user.baseCurrency).toUpperCase();
    const cadence = input.cadence.toUpperCase();
    const priceRows = await sql.unsafe(
      "SELECT p.id,pp.stripe_price_id,pp.amount_minor,pp.currency FROM plans p JOIN plan_prices pp ON pp.plan_id=p.id WHERE p.slug=$1 AND p.archived=false AND p.visible=true AND pp.currency=$2 AND pp.cadence=$3 AND pp.active=true LIMIT 1",
      [input.planSlug, currency, cadence]
    );
    const price = priceRows[0];
    if (!price) {
      return Response.json({ error: "That plan is not configured in " + currency + " for " + input.cadence + " billing." }, { status: 404 });
    }
    if (!price.stripe_price_id) {
      return Response.json({ error: "Stripe Price ID is not configured for this plan price." }, { status: 503 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const subRows = await sql.unsafe(
      "SELECT stripe_customer_id,stripe_subscription_id,status FROM subscriptions WHERE user_id=$1 LIMIT 1",
      [user.id]
    );
    const local = subRows[0];
    if (local?.stripe_subscription_id && !["FREE", "CANCELED"].includes(String(local.status))) {
      return Response.json({ error: "You already have a Stripe subscription. Use Manage billing to change the plan or billing cycle." }, { status: 409 });
    }

    let customerId = local?.stripe_customer_id ? String(local.stripe_customer_id) : null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { userId: user.id } },
        { idempotencyKey: "strategyos-customer-" + user.id }
      );
      customerId = customer.id;
      await sql.unsafe(
        "UPDATE subscriptions SET stripe_customer_id=$1,updated_at=now() WHERE user_id=$2 AND stripe_customer_id IS NULL",
        [customerId, user.id]
      );
      const canonical = await sql.unsafe(
        "SELECT stripe_customer_id FROM subscriptions WHERE user_id=$1 LIMIT 1",
        [user.id]
      );
      customerId = canonical[0]?.stripe_customer_id ? String(canonical[0].stripe_customer_id) : customerId;
    }

    const hourBucket = Math.floor(Date.now() / 3_600_000);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: String(price.stripe_price_id), quantity: 1 }],
        success_url: process.env.NEXT_PUBLIC_APP_URL + "/app/settings?billing=success",
        cancel_url: process.env.NEXT_PUBLIC_APP_URL + "/app/settings?billing=cancelled",
        subscription_data: { metadata: { userId: user.id, planId: String(price.id) } },
        metadata: { userId: user.id, planId: String(price.id), cadence: input.cadence, currency }
      },
      { idempotencyKey: ["strategyos-checkout", user.id, String(price.id), currency, input.cadence, String(hourBucket)].join("-") }
    );
    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Choose a valid plan, billing cycle and currency." }, { status: 400 });
    }
    return Response.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
