-- Remembers which operational alerts are open so administrators are emailed once when something
-- breaks, reminded daily while it stays broken, and told when it clears.
CREATE TABLE IF NOT EXISTS ops_alert_state (
  alert_key text PRIMARY KEY,
  title text NOT NULL,
  severity text NOT NULL,
  detail text NOT NULL DEFAULT '',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_notified_at timestamptz,
  resolved_at timestamptz
);
