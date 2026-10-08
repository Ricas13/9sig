-- Subscriptions bought through the Apple App Store or Google Play (via RevenueCat) share the one
-- subscriptions row per user with website (Stripe) subscriptions. `source` says who bills the user,
-- so the two systems can never both be live for the same person.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'STRIPE';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS store_product_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS store_original_transaction_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS store_event_at timestamptz;
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_source_check CHECK (source IN ('STRIPE','APPLE','GOOGLE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_store_txn_unique
  ON subscriptions(store_original_transaction_id) WHERE store_original_transaction_id IS NOT NULL;

-- Which store product sells which plan and cadence. One store product maps to exactly one price.
ALTER TABLE plan_prices ADD COLUMN IF NOT EXISTS apple_product_id text;
ALTER TABLE plan_prices ADD COLUMN IF NOT EXISTS google_product_id text;
CREATE UNIQUE INDEX IF NOT EXISTS plan_price_apple_unique ON plan_prices(apple_product_id) WHERE apple_product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS plan_price_google_unique ON plan_prices(google_product_id) WHERE google_product_id IS NOT NULL;

-- Idempotency and audit for store notifications.
CREATE TABLE IF NOT EXISTS store_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  outcome text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
