ALTER TABLE strategy_instances
  ADD COLUMN contribution_plan jsonb NOT NULL DEFAULT '{"enabled":false,"amount":"0","frequency":"MONTHLY","nextDate":null}'::jsonb;
