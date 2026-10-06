ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS supported_billing_currencies jsonb NOT NULL DEFAULT '["GBP"]'::jsonb;

CREATE TABLE IF NOT EXISTS canonical_model_performance (
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
  date date NOT NULL,
  value numeric(28,10) NOT NULL,
  benchmark_value numeric(28,10),
  source text NOT NULL DEFAULT 'ADMIN',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(strategy_version_id,date)
);

CREATE TABLE IF NOT EXISTS worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_key text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS worker_runs_key_time_idx ON worker_runs(worker_key,started_at);
