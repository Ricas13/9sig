CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  country text NOT NULL DEFAULT 'GB',
  base_currency text NOT NULL DEFAULT 'GBP',
  timezone text NOT NULL DEFAULT 'Europe/London',
  role text NOT NULL DEFAULT 'USER',
  anonymous_aggregate_opt_in boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens(user_id,type);

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  monthly_price_minor integer NOT NULL DEFAULT 0,
  annual_price_minor integer NOT NULL DEFAULT 0,
  billing_currency text NOT NULL DEFAULT 'GBP',
  stripe_monthly_price_id text,
  stripe_annual_price_id text,
  max_active_strategies integer,
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  available_strategy_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  trial_days integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  archived boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'FREE',
  cadence text NOT NULL DEFAULT 'FREE',
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  family text NOT NULL,
  description text NOT NULL DEFAULT '',
  engine text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  proprietary boolean NOT NULL DEFAULT false,
  default_benchmark_key text,
  supported_regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  supported_wrappers jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_definition_id uuid NOT NULL REFERENCES strategy_definitions(id),
  version text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  config jsonb NOT NULL,
  disclosure text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(strategy_definition_id, version)
);
CREATE INDEX IF NOT EXISTS strategy_version_effective_idx ON strategy_versions(strategy_definition_id,effective_from);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  wrapper text NOT NULL,
  country text NOT NULL,
  currency text NOT NULL,
  broker_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts(user_id);

CREATE TABLE IF NOT EXISTS strategy_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  strategy_definition_id uuid NOT NULL REFERENCES strategy_definitions(id),
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  onboarding_mode text NOT NULL DEFAULT 'START_NEW',
  started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  closed_at timestamptz,
  health_status text NOT NULL DEFAULT 'NEEDS_ATTENTION',
  last_reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategy_instances_user_idx ON strategy_instances(user_id,status);
CREATE INDEX IF NOT EXISTS strategy_instances_definition_idx ON strategy_instances(strategy_definition_id,status);

CREATE TABLE IF NOT EXISTS strategy_states (
  strategy_instance_id uuid PRIMARY KEY REFERENCES strategy_instances(id) ON DELETE CASCADE,
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  source_as_of timestamptz,
  confidence text NOT NULL DEFAULT 'LOW'
);

CREATE TABLE IF NOT EXISTS instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isin text UNIQUE,
  provider_instrument_id text,
  name text NOT NULL,
  economic_exposure text NOT NULL,
  leverage numeric(12,6) NOT NULL DEFAULT 1,
  direction text NOT NULL DEFAULT 'LONG',
  fund_currency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS instrument_exposure_idx ON instruments(economic_exposure,leverage);

CREATE TABLE IF NOT EXISTS trading_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  exchange text NOT NULL,
  currency text NOT NULL,
  exchange_timezone text NOT NULL,
  provider_symbol text,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(exchange,ticker,effective_from)
);
CREATE INDEX IF NOT EXISTS trading_line_instrument_idx ON trading_lines(instrument_id);

CREATE TABLE IF NOT EXISTS regional_instrument_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  economic_exposure text NOT NULL,
  leverage numeric(12,6) NOT NULL DEFAULT 1,
  direction text NOT NULL DEFAULT 'LONG',
  country text NOT NULL,
  wrapper text NOT NULL,
  broker text,
  preferred_currency text,
  trading_line_id uuid NOT NULL REFERENCES trading_lines(id),
  fidelity text NOT NULL DEFAULT 'EXACT',
  effective_from date NOT NULL,
  effective_to date,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS regional_mapping_lookup_idx ON regional_instrument_mappings(economic_exposure,country,wrapper,effective_from);

CREATE TABLE IF NOT EXISTS ledger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_instance_id uuid NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  event_type text NOT NULL,
  currency text NOT NULL,
  cash_amount numeric(24,8) NOT NULL DEFAULT 0,
  instrument_id uuid REFERENCES instruments(id),
  quantity numeric(30,12) NOT NULL DEFAULT 0,
  unit_price numeric(24,10),
  fee_amount numeric(24,8) NOT NULL DEFAULT 0,
  provenance text NOT NULL DEFAULT 'USER_ENTERED',
  confidence text NOT NULL DEFAULT 'VERIFIED',
  correction_of_event_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'USER',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_instance_time_idx ON ledger_events(strategy_instance_id,occurred_at,created_at);

CREATE TABLE IF NOT EXISTS reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_instance_id uuid NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  expected_value numeric(24,8),
  broker_reported_value numeric(24,8),
  difference numeric(24,8),
  reason text,
  provenance text NOT NULL DEFAULT 'USER_CONFIRMED',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reconciliation_instance_idx ON reconciliations(strategy_instance_id,occurred_at);

CREATE TABLE IF NOT EXISTS overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_instance_id uuid NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  automatic_value jsonb,
  manual_value jsonb,
  active boolean NOT NULL DEFAULT true,
  reason text,
  created_by text NOT NULL DEFAULT 'USER',
  restored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS override_active_idx ON overrides(strategy_instance_id,field_key,active);

CREATE TABLE IF NOT EXISTS market_data_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_line_id uuid NOT NULL REFERENCES trading_lines(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  price numeric(24,10) NOT NULL,
  currency text NOT NULL,
  provider text NOT NULL,
  freshness text NOT NULL DEFAULT 'CURRENT',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trading_line_id,observed_at,provider)
);
CREATE INDEX IF NOT EXISTS market_observation_latest_idx ON market_data_observations(trading_line_id,observed_at);

CREATE TABLE IF NOT EXISTS actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_instance_id uuid NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id),
  fingerprint text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'CALCULATED',
  title text NOT NULL,
  instruction text NOT NULL,
  amount numeric(24,8),
  currency text,
  trading_line_id uuid REFERENCES trading_lines(id),
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence text NOT NULL DEFAULT 'HIGH',
  due_at timestamptz,
  acknowledged_at timestamptz,
  executed_at timestamptz,
  reconciled_at timestamptz,
  cancelled_at timestamptz,
  superseded_by_action_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(strategy_instance_id,fingerprint)
);
CREATE INDEX IF NOT EXISTS action_queue_idx ON actions(strategy_instance_id,status,due_at);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_id uuid REFERENCES actions(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_user_idx ON notifications(user_id,read_at,created_at);

CREATE TABLE IF NOT EXISTS notification_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  encrypted_destination text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,channel)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_delivery_pending_idx ON notification_deliveries(status,next_attempt_at);

CREATE TABLE IF NOT EXISTS performance_series (
  strategy_instance_id uuid NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  series_type text NOT NULL,
  date date NOT NULL,
  value numeric(28,10) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(strategy_instance_id,series_type,date)
);

CREATE TABLE IF NOT EXISTS benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  economic_exposure text NOT NULL,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS anonymous_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_definition_id uuid NOT NULL REFERENCES strategy_definitions(id),
  cohort_key text NOT NULL,
  metric_key text NOT NULL,
  as_of_date date NOT NULL,
  sample_size integer NOT NULL,
  value numeric(28,10) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(strategy_definition_id,cohort_key,metric_key,as_of_date)
);
CREATE INDEX IF NOT EXISTS anonymous_aggregate_publish_idx ON anonymous_aggregates(as_of_date,sample_size);

CREATE TABLE IF NOT EXISTS feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_time_idx ON audit_events(occurred_at);
