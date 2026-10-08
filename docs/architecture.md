# Architecture

Wealtharr is a modular monolith. The web UI, API, strategy engines, billing, notifications and data-access layer live in one deployable application while external vendors remain behind interfaces.

Core domain flow:

User -> Account -> StrategyInstance -> StrategyVersion

Source data is represented by append-oriented LedgerEvent records. Calculations produce derived state and Action records. User corrections are separate Override records. Reconciliation adds an explicit adjustment rather than rewriting old trades.

The strategy registry selects a reusable engine from StrategyDefinition.engine. A StrategyVersion supplies immutable configuration. Historical actions keep the strategy_version_id used when they were calculated.

Critical rules:
- never use JavaScript floating point for accounting decisions
- never advance strategy state merely because an action was calculated
- never produce a high-confidence financial action from stale or missing critical source data
- never treat a ticker as a stable instrument identity
- never let a deposit masquerade as return
