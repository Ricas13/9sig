# Ledger and reconciliation

ledger_events is the financial source history.

Cash amounts and quantities are signed. Contributions add cash. Buys reduce cash and add quantity. Sales add cash and reduce quantity. Fees reduce cash.

Events are not edited to force today's numbers to match. A broker discrepancy creates a reconciliation record and, when accepted, a BROKER_ADJUSTMENT ledger event. The original history remains available.

Overrides store automatic_value and manual_value separately and can be restored by deactivating the override. Current engine integration supports reversible strategy target overrides and instrument-price overrides.
