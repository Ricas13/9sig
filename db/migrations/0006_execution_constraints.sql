ALTER TABLE strategy_instances
  ADD COLUMN execution_constraints jsonb NOT NULL DEFAULT '{"fractionalShares":true,"minimumTradeAmount":"0","cashBufferAmount":"0","flatFee":"0","allowSelling":true}'::jsonb;
