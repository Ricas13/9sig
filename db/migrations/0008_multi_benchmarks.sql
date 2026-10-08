CREATE TABLE IF NOT EXISTS benchmark_performance (
  benchmark_id uuid NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
  date date NOT NULL,
  value numeric(28,10) NOT NULL,
  source text NOT NULL DEFAULT 'ADMIN',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (benchmark_id,date)
);

CREATE TABLE IF NOT EXISTS strategy_version_benchmarks (
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
  benchmark_id uuid NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  default_visible boolean NOT NULL DEFAULT false,
  PRIMARY KEY (strategy_version_id,benchmark_id)
);

CREATE INDEX IF NOT EXISTS strategy_version_benchmark_order_idx
  ON strategy_version_benchmarks(strategy_version_id,sort_order);
