DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Case-insensitive duplicate user emails must be resolved before applying 0006';
  END IF;
END $$;

UPDATE users SET email=lower(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users(lower(email));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 1;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS delinquency_grace_days integer NOT NULL DEFAULT 3;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_grace_until timestamptz;

ALTER TABLE ledger_events
  ADD COLUMN IF NOT EXISTS trading_line_id uuid REFERENCES trading_lines(id);

UPDATE ledger_events
SET trading_line_id=(metadata->>'tradingLineId')::uuid
WHERE trading_line_id IS NULL
  AND metadata ? 'tradingLineId'
  AND (metadata->>'tradingLineId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE ledger_events l
SET trading_line_id=a.trading_line_id
FROM actions a
WHERE l.trading_line_id IS NULL
  AND a.trading_line_id IS NOT NULL
  AND l.metadata->>'actionId'=a.id::text;

UPDATE ledger_events correction
SET trading_line_id=original.trading_line_id
FROM ledger_events original
WHERE correction.trading_line_id IS NULL
  AND correction.correction_of_event_id=original.id
  AND original.trading_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ledger_trading_line_idx
  ON ledger_events(strategy_instance_id,trading_line_id);

CREATE UNIQUE INDEX IF NOT EXISTS ledger_correction_once_unique
  ON ledger_events(correction_of_event_id)
  WHERE correction_of_event_id IS NOT NULL;

DROP INDEX IF EXISTS notification_action_unique;
CREATE UNIQUE INDEX IF NOT EXISTS notification_action_type_unique
  ON notifications(action_id,type)
  WHERE action_id IS NOT NULL;


WITH ranked AS (
  SELECT id,row_number() OVER (PARTITION BY strategy_instance_id,field_key ORDER BY created_at DESC,id DESC) AS rn
  FROM overrides
  WHERE active=true
)
UPDATE overrides o
SET active=false,restored_at=COALESCE(restored_at,now()),updated_at=now()
FROM ranked r
WHERE o.id=r.id AND r.rn>1;

CREATE UNIQUE INDEX IF NOT EXISTS overrides_one_active_unique
  ON overrides(strategy_instance_id,field_key)
  WHERE active=true;
