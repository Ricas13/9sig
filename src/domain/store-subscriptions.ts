// Translation of RevenueCat notifications (which relay App Store / Google Play events) into what
// happens to a user's subscription row. Pure, so every event type is covered by unit tests.
export type StoreEvent = {
  id: string;
  type: string;
  appUserId: string;
  productId: string | null;
  newProductId: string | null;
  store: "APP_STORE" | "PLAY_STORE" | string;
  environment: "SANDBOX" | "PRODUCTION" | string;
  originalTransactionId: string | null;
  expirationAt: Date | null;
  eventAt: Date | null;
  periodType: string | null;
  cancelReason: string | null;
};

export type StoreEffect =
  | { kind: "IGNORE"; reason: string }
  | { kind: "ACTIVATE"; status: "ACTIVE" | "TRIALING" | "PAST_DUE"; cancelAtPeriodEnd: boolean; productId: string }
  | { kind: "END" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUserId = (value: string) => UUID.test(value);

export function storeSource(store: string): "APPLE" | "GOOGLE" | null {
  return store === "APP_STORE" ? "APPLE" : store === "PLAY_STORE" ? "GOOGLE" : null;
}

/** Reads the fields we use from a RevenueCat webhook body; null when it is not recognisable. */
export function parseStoreEvent(body: unknown): StoreEvent | null {
  const event = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!event || typeof event !== "object") return null;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const date = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? new Date(value) : null);
  const id = text(event.id);
  const type = text(event.type);
  const appUserId = text(event.app_user_id);
  if (!id || !type || !appUserId) return null;
  return {
    id, type, appUserId,
    productId: text(event.product_id), newProductId: text(event.new_product_id),
    store: text(event.store) ?? "", environment: text(event.environment) ?? "",
    originalTransactionId: text(event.original_transaction_id),
    expirationAt: date(event.expiration_at_ms), eventAt: date(event.event_timestamp_ms),
    periodType: text(event.period_type), cancelReason: text(event.cancel_reason)
  };
}

export function effectOf(event: StoreEvent): StoreEffect {
  const productId = event.newProductId ?? event.productId;
  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
      if (!productId) return { kind: "IGNORE", reason: "NO_PRODUCT" };
      return { kind: "ACTIVATE", status: event.periodType === "TRIAL" ? "TRIALING" : "ACTIVE", cancelAtPeriodEnd: false, productId };
    case "CANCELLATION":
      if (!productId) return { kind: "IGNORE", reason: "NO_PRODUCT" };
      // A refund takes access away straight away; an ordinary cancellation lasts to the period end.
      if (event.cancelReason === "CUSTOMER_SUPPORT") return { kind: "END" };
      return { kind: "ACTIVATE", status: "ACTIVE", cancelAtPeriodEnd: true, productId };
    case "BILLING_ISSUE":
      if (!productId) return { kind: "IGNORE", reason: "NO_PRODUCT" };
      return { kind: "ACTIVATE", status: "PAST_DUE", cancelAtPeriodEnd: false, productId };
    case "EXPIRATION":
    case "SUBSCRIPTION_PAUSED":
      return { kind: "END" };
    case "TRANSFER":
      return { kind: "IGNORE", reason: "TRANSFER_NEEDS_REVIEW" };
    default:
      return { kind: "IGNORE", reason: "NOT_A_SUBSCRIPTION_CHANGE" };
  }
}
