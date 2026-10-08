-- Observed-at provenance and enforced expiry for manual market-price corrections.
-- Legacy overrides have no evidence timestamp: expire them rather than silently
-- trusting them for customer-facing execution quantities.
ALTER TABLE overrides ADD COLUMN IF NOT EXISTS observed_at timestamptz;
ALTER TABLE overrides ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE overrides SET active=false,restored_at=now(),updated_at=now()
WHERE active=true AND field_key LIKE 'market_price:%' AND observed_at IS NULL;
CREATE INDEX IF NOT EXISTS overrides_expires_idx ON overrides(strategy_instance_id,field_key,expires_at)
WHERE active=true;
