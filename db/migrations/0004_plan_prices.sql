CREATE TABLE IF NOT EXISTS plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  currency text NOT NULL,
  cadence text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  stripe_price_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id,currency,cadence)
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_price_stripe_unique
  ON plan_prices(stripe_price_id)
  WHERE stripe_price_id IS NOT NULL;
