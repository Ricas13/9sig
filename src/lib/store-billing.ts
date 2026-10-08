import "server-only";
import { sql } from "@/lib/db";
import { enforceStrategyEntitlements } from "@/lib/entitlement-service";
import { effectOf, isUserId, storeSource, type StoreEvent } from "@/domain/store-subscriptions";
import { isTerminalLocalStatus } from "@/domain/subscription-status";

export type StoreOutcome =
  | "APPLIED" | "ENDED" | "IGNORED" | "DUPLICATE" | "CONFLICT" | "UNKNOWN_PRODUCT" | "UNKNOWN_USER" | "STALE" | "SANDBOX_REFUSED";

/**
 * Applies one RevenueCat notification. Everything happens under the user's subscription row lock and
 * in one transaction, together with the idempotency record, so a replayed or concurrent delivery can
 * never apply twice and a failure rolls back cleanly (RevenueCat then retries).
 *
 * Safety rules:
 *  - never overwrite a live website (Stripe) subscription: that would leave the user billed twice;
 *  - sandbox purchases are free to make, so they count only where the operator allowed them;
 *  - an expiry only ends the subscription it belongs to, never a newer one;
 *  - the plan comes from the operator's product mapping, never from anything in the payload.
 */
export async function applyStoreEvent(event: StoreEvent, options: { allowSandbox: boolean }, now = new Date()): Promise<{ outcome: StoreOutcome; userId?: string }> {
  const result = await sql.begin(async (tx): Promise<{ outcome: StoreOutcome; userId?: string }> => {
    const claimed = await tx.unsafe(
      "INSERT INTO store_webhook_events (event_id,event_type,outcome) VALUES ($1,$2,'PROCESSING') ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
      [event.id, event.type]
    );
    if (!claimed[0]) return { outcome: "DUPLICATE" };

    const finish = async (outcome: StoreOutcome, userId?: string, review?: Record<string, unknown>) => {
      await tx.unsafe("UPDATE store_webhook_events SET outcome=$2,user_id=$3 WHERE event_id=$1", [event.id, outcome, userId ?? null]);
      if (review) {
        await tx.unsafe(
          "INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,'billing.store-needs-review','user',$2,$3::jsonb)",
          [userId ?? null, userId ?? null, JSON.stringify({ eventId: event.id, type: event.type, productId: event.newProductId ?? event.productId, ...review })]
        );
      }
      return { outcome, userId };
    };

    const source = storeSource(event.store);
    if (!source) return finish("IGNORED");
    if (event.environment === "SANDBOX" && !options.allowSandbox) return finish("SANDBOX_REFUSED");

    const effect = effectOf(event);
    if (effect.kind === "IGNORE") {
      return finish("IGNORED", undefined, effect.reason === "TRANSFER_NEEDS_REVIEW" ? { reason: effect.reason, appUserId: event.appUserId } : undefined);
    }
    if (!isUserId(event.appUserId)) return finish("UNKNOWN_USER");
    const users = await tx.unsafe("SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL", [event.appUserId]);
    if (!users[0]) return finish("UNKNOWN_USER");
    const userId = String(users[0].id);

    const rows = await tx.unsafe(
      "SELECT source,status,stripe_subscription_id,store_original_transaction_id,store_event_at FROM subscriptions WHERE user_id=$1 FOR UPDATE",
      [userId]
    );
    const row = rows[0];
    if (!row) return finish("UNKNOWN_USER", userId);

    const sameSubscription = event.originalTransactionId != null && row.store_original_transaction_id === event.originalTransactionId;
    if (sameSubscription && row.store_event_at && event.eventAt && event.eventAt < new Date(row.store_event_at)) {
      return finish("STALE", userId);
    }

    const expired = effect.kind === "END" || (event.expirationAt != null && event.expirationAt <= now && effect.status !== "PAST_DUE");
    if (expired) {
      if (!(row.source === source && sameSubscription)) return finish("IGNORED", userId);
      await tx.unsafe(
        "UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE slug='free' LIMIT 1),status='FREE',cadence='FREE',source='STRIPE',store_product_id=NULL,store_original_transaction_id=NULL,store_event_at=NULL,current_period_end=NULL,cancel_at_period_end=false,updated_at=now() WHERE user_id=$1",
        [userId]
      );
      return finish("ENDED", userId);
    }
    if (effect.kind !== "ACTIVATE") return finish("IGNORED", userId);

    const column = source === "APPLE" ? "apple_product_id" : "google_product_id";
    const priced = await tx.unsafe(`SELECT plan_id,cadence FROM plan_prices WHERE ${column}=$1 AND active=true LIMIT 2`, [effect.productId]);
    if (priced.length !== 1) return finish("UNKNOWN_PRODUCT", userId, { reason: priced.length ? "AMBIGUOUS_PRODUCT" : "PRODUCT_NOT_MAPPED" });

    const liveElsewhere = !isTerminalLocalStatus(row.status) && !sameSubscription;
    if (liveElsewhere) {
      // A live website subscription, or a live subscription bought in the other store, is already billing this user.
      return finish("CONFLICT", userId, { reason: row.source === "STRIPE" ? "LIVE_WEBSITE_SUBSCRIPTION" : "LIVE_OTHER_STORE_SUBSCRIPTION", source: String(row.source) });
    }

    await tx.unsafe(
      "UPDATE subscriptions SET plan_id=$2,status=$3,cadence=$4,source=$5,store_product_id=$6,store_original_transaction_id=$7,store_event_at=$8,current_period_end=$9,cancel_at_period_end=$10,updated_at=now() WHERE user_id=$1",
      [userId, priced[0].plan_id, effect.status, String(priced[0].cadence).toUpperCase(), source, effect.productId, event.originalTransactionId, event.eventAt ?? now, event.expirationAt, effect.cancelAtPeriodEnd]
    );
    return finish("APPLIED", userId);
  });

  if (result.userId && (result.outcome === "APPLIED" || result.outcome === "ENDED")) {
    await enforceStrategyEntitlements(result.userId);
  }
  return result;
}
