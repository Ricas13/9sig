-- scripts/seed.ts used to store plans.entitlements and strategy_versions.config as a JSON *string*
-- containing JSON text instead of a JSON object, so named rules (target rate, exposure, ...) could
-- not be read and silently fell back to engine defaults. Unwrap them. Only string values whose text
-- is itself a JSON object/array are touched, so the migration is idempotent and safe to re-run.
UPDATE plans
SET entitlements = (entitlements #>> '{}')::jsonb
WHERE jsonb_typeof(entitlements) = 'string'
  AND (entitlements #>> '{}') ~ '^\s*[\{\[]';

UPDATE strategy_versions
SET config = (config #>> '{}')::jsonb
WHERE jsonb_typeof(config) = 'string'
  AND (config #>> '{}') ~ '^\s*[\{\[]';
