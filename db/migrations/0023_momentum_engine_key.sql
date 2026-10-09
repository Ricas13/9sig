-- The registered engine is MOMENTUM_ROTATION; the seed and catalogue used the shorter "MOMENTUM",
-- which no engine answers to. Align existing rows. Only drafts are touched: published versions are
-- immutable, and no momentum strategy can be published.
UPDATE strategy_definitions SET engine='MOMENTUM_ROTATION' WHERE engine='MOMENTUM';
UPDATE strategy_versions SET engine_key='MOMENTUM_ROTATION' WHERE engine_key='MOMENTUM' AND lifecycle_status<>'PUBLISHED';

-- HFEA and Golden Butterfly drafts were seeded with a 5% drift band while the reference catalogue
-- (the single source for these presets) rebalances on the calendar with no band. Align draft rows.
UPDATE strategy_versions v SET config=jsonb_set(v.config,'{rebalanceThreshold}','"0.00"')
FROM strategy_definitions d
WHERE d.id=v.strategy_definition_id AND d.key IN ('hfea','golden-butterfly') AND v.lifecycle_status='DRAFT'
  AND v.config ? 'rebalanceThreshold' AND v.config->>'rebalanceThreshold'<>'0.00';
