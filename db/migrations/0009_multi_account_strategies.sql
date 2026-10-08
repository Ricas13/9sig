CREATE TABLE IF NOT EXISTS strategy_accounts (
  strategy_instance_id uuid NOT NULL REFERENCES strategy_instances(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'SECONDARY',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy_instance_id,account_id)
);

INSERT INTO strategy_accounts (strategy_instance_id,account_id,role)
SELECT id,account_id,'PRIMARY'
FROM strategy_instances
WHERE account_id IS NOT NULL
ON CONFLICT (strategy_instance_id,account_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS strategy_accounts_primary_unique
  ON strategy_accounts(strategy_instance_id)
  WHERE role='PRIMARY';
CREATE INDEX IF NOT EXISTS strategy_accounts_account_idx
  ON strategy_accounts(account_id);

ALTER TABLE ledger_events ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
UPDATE ledger_events l
SET account_id=i.account_id
FROM strategy_instances i
WHERE l.strategy_instance_id=i.id AND l.account_id IS NULL;
CREATE INDEX IF NOT EXISTS ledger_account_time_idx
  ON ledger_events(account_id,occurred_at,created_at);

ALTER TABLE actions ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
UPDATE actions a
SET account_id=i.account_id
FROM strategy_instances i
WHERE a.strategy_instance_id=i.id AND a.account_id IS NULL;
CREATE INDEX IF NOT EXISTS action_account_idx ON actions(account_id,status,due_at);

ALTER TABLE reconciliations ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
UPDATE reconciliations r
SET account_id=i.account_id
FROM strategy_instances i
WHERE r.strategy_instance_id=i.id AND r.account_id IS NULL;
CREATE INDEX IF NOT EXISTS reconciliation_account_idx ON reconciliations(account_id,occurred_at);
