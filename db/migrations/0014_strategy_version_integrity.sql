-- Published strategy rules are what live users calculate against. Enforce in the database what the
-- admin API promises, so no code path or concurrent operator can break it.

-- One published version per strategy and effective date. Two operators publishing drafts with the
-- same date at the same moment could previously both succeed.
CREATE UNIQUE INDEX IF NOT EXISTS strategy_versions_published_effective_unique
  ON strategy_versions (strategy_definition_id, effective_from)
  WHERE lifecycle_status = 'PUBLISHED';

-- A published version's rules (config, input schema, engine, dates of effect, identity) are
-- immutable. Lifecycle changes (retire) and effective_to/notes remain editable. Maintenance tooling
-- that must correct a published row can opt in explicitly with: SET app.allow_published_edit = 'on'.
CREATE OR REPLACE FUNCTION strategy_versions_guard_published() RETURNS trigger AS $$
BEGIN
  IF OLD.lifecycle_status = 'PUBLISHED'
     AND coalesce(current_setting('app.allow_published_edit', true), '') <> 'on'
     AND (NEW.config IS DISTINCT FROM OLD.config
       OR NEW.input_schema IS DISTINCT FROM OLD.input_schema
       OR NEW.engine_key IS DISTINCT FROM OLD.engine_key
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.strategy_definition_id IS DISTINCT FROM OLD.strategy_definition_id) THEN
    RAISE EXCEPTION 'PUBLISHED_STRATEGY_VERSION_IS_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS strategy_versions_published_immutable ON strategy_versions;
CREATE TRIGGER strategy_versions_published_immutable
  BEFORE UPDATE ON strategy_versions
  FOR EACH ROW EXECUTE FUNCTION strategy_versions_guard_published();
