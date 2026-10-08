import Stripe from "stripe";
import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";
import { authFailure } from "@/lib/api-auth";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const rows = await sql.unsafe(
      "SELECT stripe_customer_id,stripe_subscription_id FROM subscriptions WHERE user_id=$1 LIMIT 1",
      [user.id]
    );
    const billing = rows[0];
    const hasStripe = Boolean(billing?.stripe_customer_id || billing?.stripe_subscription_id);

    if (hasStripe) {
      if (!process.env.STRIPE_SECRET_KEY) {
        return Response.json({ error: "Billing must be disconnected before this account can be deleted." }, { status: 503 });
      }
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      // Stripe must be cleaned up first so a deleted user is never billed again, but the
      // call has to be retry-safe: if the local delete failed after Stripe succeeded, the
      // customer is already gone and a retry must carry on to the local delete.
      try {
        if (billing.stripe_customer_id) {
          await stripe.customers.del(String(billing.stripe_customer_id));
        } else if (billing.stripe_subscription_id) {
          const subscription = await stripe.subscriptions.retrieve(String(billing.stripe_subscription_id));
          if (subscription.status !== "canceled") await stripe.subscriptions.cancel(subscription.id);
        }
      } catch (stripeError) {
        if ((stripeError as { code?: string })?.code !== "resource_missing") throw stripeError;
      }
    }

    await sql.begin(async (tx) => {
      await tx.unsafe(
        "INSERT INTO audit_events (action,entity_type,metadata) VALUES ('account.deleted','user',$1::jsonb)",
        [JSON.stringify({ selfService: true, billingDisconnected: hasStripe })]
      );
      await tx.unsafe("DELETE FROM users WHERE id=$1", [user.id]);
    });
    return Response.json({ ok: true });
  } catch(error){const denied=authFailure(error);if(denied)return denied;
    return Response.json({ error: "Could not delete account safely. No local data was deleted." }, { status: 500 });
  }
}
