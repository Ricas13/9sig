-- Daily adjusted-close history for momentum research. Only rows flagged licensed may feed an engine:
-- the flag is set by an ingestion path that has confirmed the provider's licence, never by users.
CREATE TABLE IF NOT EXISTS price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_line_id uuid NOT NULL REFERENCES trading_lines(id) ON DELETE CASCADE,
  trading_day date NOT NULL,
  adjusted_close numeric(24,10) NOT NULL CHECK (adjusted_close > 0),
  currency text NOT NULL,
  provider text NOT NULL,
  licensed boolean NOT NULL DEFAULT false,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trading_line_id, trading_day, provider)
);
CREATE INDEX IF NOT EXISTS price_history_line_day_idx ON price_history(trading_line_id, trading_day DESC);
