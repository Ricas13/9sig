# Strategy engine architecture

Strategy engines accept an EngineContext and return a ProposedAction plus an explanation and proposed next state.

Implemented reusable families:
- VALUE_TARGET for signal / target strategies such as a parameterised 3Sig / 6Sig / 9Sig family
- FIXED_ALLOCATION for allocation and threshold-rebalance strategies

Definitions and versions remain data, not hard-coded routes. Proprietary configurations can therefore be disabled or replaced without redesigning the platform.

The seed enables only the value-target launch definition. Other definitions remain disabled until their regional implementations and execution workflows are production-ready.


## Review schedule semantics

Review schedules are evaluated in the configured strategy timezone, falling back to the user's timezone. Strategy versions may define reviewCutoffLocal, businessDayConvention (PREVIOUS or NEXT), and marketHolidays. Weekends are always treated as non-business days. DST conversion is performed at the local cutoff time, so a 16:00 London review remains 16:00 London in both GMT and BST. Exchange-specific holiday lists should be versioned with the strategy or supplied from a licensed calendar source before enabling strategies that depend on exact market-session dates.


## Adding and updating strategies

A strategy definition is the stable product identity and editable metadata. A strategy version is the immutable rules release.

New rule changes follow:

1. create or update the strategy definition
2. create a DRAFT strategy version
3. validate the engine configuration and version-specific onboarding schema
4. update the draft as needed
5. publish the version
6. existing strategy instances remain pinned to their old version until the user explicitly migrates
7. migration records preserve from-version, to-version, state-before and state-after
8. unresolved old-version actions are superseded and the migrated instance is forced through a fresh review

Each strategy version snapshots its engine_key. Changing the definition's default engine therefore cannot silently change an old strategy version.

Strategies that use VALUE_TARGET or FIXED_ALLOCATION can be added primarily through data/configuration. A genuinely new calculation family still requires a new StrategyEngine implementation and reference tests; the surrounding SaaS, billing, onboarding, action, versioning and notification architecture does not need to be rebuilt.

Published versions are immutable. Corrections to published rules are new versions, not in-place edits.
