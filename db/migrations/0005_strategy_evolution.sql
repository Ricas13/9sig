ALTER TABLE strategy_versions ADD COLUMN IF NOT EXISTS engine_key text;
UPDATE strategy_versions v
SET engine_key=d.engine
FROM strategy_definitions d
WHERE v.strategy_definition_id=d.id AND v.engine_key IS NULL;
ALTER TABLE strategy_versions ALTER COLUMN engine_key SET NOT NULL;

ALTER TABLE strategy_versions
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS upgrade_policy text NOT NULL DEFAULT 'OPTIONAL',
  ADD COLUMN IF NOT EXISTS input_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS release_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE strategy_versions
SET lifecycle_status='PUBLISHED',
    published_at=COALESCE(published_at,created_at)
WHERE lifecycle_status='PUBLISHED' AND published_at IS NULL;

ALTER TABLE strategy_instances
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS strategy_version_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_instance_id uuid NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  from_version_id uuid NOT NULL REFERENCES strategy_versions(id),
  to_version_id uuid NOT NULL REFERENCES strategy_versions(id),
  state_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  state_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  migrated_by text NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategy_version_migration_instance_idx
  ON strategy_version_migrations(strategy_instance_id,migrated_at);
