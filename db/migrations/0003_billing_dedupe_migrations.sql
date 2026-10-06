ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS annual_discount_bps integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'PROCESSING',
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_action_unique
  ON notifications(action_id)
  WHERE action_id IS NOT NULL;
