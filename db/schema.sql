CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  subscription_status text NOT NULL DEFAULT 'inactive',
  discord_webhook_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  setup_complete boolean NOT NULL DEFAULT false,
  currency text NOT NULL DEFAULT 'GBP',
  growth_symbol text NOT NULL DEFAULT '3QQQ.L',
  reserve_symbol text NOT NULL DEFAULT 'CSH2.L',
  qqq_symbol text NOT NULL DEFAULT 'QQQ',
  start_date date,
  starting_capital numeric(18,2),
  monthly_contribution numeric(18,2),
  growth_start_ratio numeric(10,6) NOT NULL DEFAULT 0.60,
  quarterly_target numeric(10,6) NOT NULL DEFAULT 0.09,
  contribution_target_ratio numeric(10,6) NOT NULL DEFAULT 0.50,
  buy_throttle numeric(10,6) NOT NULL DEFAULT 0.90,
  signal_anchor date NOT NULL DEFAULT DATE '2026-09-28',
  current_signal_base numeric(18,2),
  signal_reference_price numeric(18,6),
  last_signal_at date,
  thirty_down_active boolean NOT NULL DEFAULT false,
  thirty_down_skipped_sells integer NOT NULL DEFAULT 0,
  thirty_down_started_at date,
  manual_growth_price numeric(18,6),
  manual_reserve_price numeric(18,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  occurred_at date NOT NULL,
  event_type text NOT NULL,
  action text NOT NULL,
  contribution_amount numeric(18,2) NOT NULL DEFAULT 0,
  growth_units_delta numeric(24,10) NOT NULL DEFAULT 0,
  reserve_units_delta numeric(24,10) NOT NULL DEFAULT 0,
  growth_price numeric(18,6),
  reserve_price numeric(18,6),
  signal_target numeric(18,2),
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_portfolio_date_idx ON transactions(portfolio_id, occurred_at);

CREATE TABLE IF NOT EXISTS reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  occurred_at date NOT NULL,
  growth_units numeric(24,10) NOT NULL,
  reserve_units numeric(24,10) NOT NULL,
  growth_value numeric(18,2),
  reserve_value numeric(18,2),
  total_value numeric(18,2),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reconciliations_portfolio_date_idx ON reconciliations(portfolio_id, occurred_at);

CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_key)
);