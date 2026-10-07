ALTER TABLE ledger_events
  ADD COLUMN IF NOT EXISTS request_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_strategy_request_unique
  ON ledger_events(strategy_instance_id,request_key)
  WHERE request_key IS NOT NULL;

ALTER TABLE reconciliations
  ADD COLUMN IF NOT EXISTS request_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS reconciliations_strategy_request_unique
  ON reconciliations(strategy_instance_id,request_key)
  WHERE request_key IS NOT NULL;
