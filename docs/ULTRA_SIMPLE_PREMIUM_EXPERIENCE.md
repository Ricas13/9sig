# Ultra-Simple Premium Product Experience

Status: implementation roadmap for the long-lived product-experience PR.

## Product promise

The platform must be powerful enough to manage real rules-based investment strategies while feeling simple enough for a first-time investor to understand within seconds.

The default experience should answer four questions:

1. Where am I?
2. What do I need to do now?
3. Why?
4. What happens next?

The internal engine may be sophisticated. The customer-facing experience must not expose that complexity unless the user deliberately asks for it.

## Non-negotiable UX principles

- Default to action, not analysis.
- Progressive disclosure: show complexity only when it becomes relevant.
- Prefer one obvious primary action per screen.
- Never require a user to reconstruct unnecessary history to begin using the product.
- Never treat normal real-world deviations as errors: missed contributions, partial trades, withdrawals, late rebalances and changed circumstances must be recoverable.
- Strategy logic and execution constraints must remain separate.
- A strategy update must never silently rewrite an existing customer's rules.
- Financial calculations remain deterministic, auditable and server-authoritative.
- Visual polish must never make an action ambiguous.
- Every important number or instruction must be understandable without finance expertise.
- Mobile is a first-class experience, not a compressed desktop layout.
- The product remains generic and multi-strategy. 9Sig is a strategy, not the architecture.

## Primary customer experience

### Action Mode — default

This is the core product. A customer should be able to run their strategy without leaving this mode.

The main dashboard should prominently show:

- current portfolio value
- return / progress
- current strategy and version
- one clear "Today's action" card
- amount / units / instrument to buy, sell, hold or wait
- a short plain-English reason
- next review / rebalance date
- contribution status where relevant
- a clear completion flow

Example:

> Today's action  
> Buy £420 of 3QQQ
>
> Why  
> Your current allocation is below the strategy target.
>
> Next review  
> 1 January 2027

Secondary information stays visually subordinate.

### Explore Mode — optional

Advanced detail lives here so it does not pollute the normal workflow.

It may contain:

- interactive performance chart
- benchmark comparison
- allocation history
- contribution history
- transaction / ledger history
- strategy rules
- drawdown / risk statistics
- what-if tools
- strategy-version comparisons
- detailed explanations
- filters and time ranges

Users should never need Explore Mode to know what to do next.

## Navigation

Keep customer navigation intentionally small:

- Home
- Portfolio
- Activity
- Explore
- Settings

Strategy switching should be handled by a lightweight strategy switcher rather than multiplying navigation items.

Admin navigation remains separate from customer navigation.

## Onboarding

Onboarding should use a short stepper with strong visual feedback and minimal fields.

### Step 1 — choose strategy

Only production-ready strategies are selectable.

Cards should explain each strategy in plain language with a short risk / behavior summary, not a wall of metrics.

### Step 2 — Start or Resume

Two obvious choices:

- Start a new strategy
- Continue an existing strategy

### Start flow

Collect only what is necessary:

- starting amount / holdings
- contribution amount
- contribution frequency
- account currency
- broker capability questions only when relevant

### Resume flow

A customer must be able to join without reconstructing their entire trading history.

Minimum useful snapshot:

- current holdings
- current cash
- account currency
- current / approximate strategy position when the strategy needs it
- last known rebalance / review when required
- contribution amount / frequency

The system creates an opening snapshot and clearly separates:

- performance tracked by this platform
- optional pre-platform history

Do not fabricate historical returns from incomplete data.

### Progressive configuration

Do not ask every possible question up front.

Ask for advanced settings later only when a real condition makes them relevant, for example:

- fractional shares unsupported
- a second account was added
- a minimum trade prevents an exact rebalance
- an FX charge becomes relevant
- the user wants a cash buffer

## Customer situations that must work

The implementation must support and test:

- £0 / first contribution start
- small portfolios where exact target allocations are impossible
- very large portfolios
- fractional shares allowed
- fractional shares not allowed
- minimum order sizes
- regular contributions
- irregular contributions
- skipped contributions
- one-off deposits
- full and partial withdrawals
- missed / late rebalances
- partial execution of a recommendation
- wrong trade entered then corrected
- actual execution price differing from the recommendation
- changed broker
- unavailable instrument
- multiple accounts / wrappers
- multiple currencies
- paused strategy
- resumed strategy
- strategy migration
- strategy retirement
- market holidays / closed markets
- instrument splits, ticker changes and other supported corporate-action adjustments
- zero-cash and cash-heavy states
- temporary data-provider unavailability
- stale prices
- reconciliation drift

Normal real-world behavior must result in recalculation and recovery, not a dead-end state.

## Strategy, portfolio and execution separation

Preserve four clear responsibilities.

### Strategy Engine

Determines the ideal strategy state and theoretical target.

It should not know UI details or broker quirks.

### Portfolio Engine

Represents what the customer actually owns, cash balances and account structure.

### Execution Engine

Converts the ideal target into the simplest practical action using the customer's constraints.

Examples of constraints:

- fractional shares yes/no
- minimum trade size
- available instruments
- broker fees
- FX fees
- cash reserve
- selling allowed / disallowed
- account-specific restrictions
- contribution amount
- tax-aware preference flags where supported

### Explanation Engine

Turns the calculated result into concise customer language.

The customer should see:

> Buy 11 shares of 3QQQ — approximately £794

rather than the optimizer's internal reasoning.

## Intelligent new-money rebalancing

Prefer correcting allocations with new contributions before recommending unnecessary sells when the strategy permits it.

Example:

> You added £1,000.  
> Buy £1,000 of 3QQQ. No selling is needed.

The execution engine should optimize for practical simplicity while remaining faithful to strategy rules.

## Action lifecycle

Customer actions must remain clear and auditable.

Supported action types include:

- BUY
- SELL
- HOLD
- WAIT
- CONTRIBUTE
- WITHDRAW
- REVIEW
- REBALANCE

The interface should support:

- mark completed
- enter actual units
- enter actual execution price
- record partial completion
- correct an incorrect entry via the append-only correction model
- explain why the action changed after new information

Completing an action should use a polished success interaction, then immediately show the new state / next step.

## What-if preview

Provide a simple non-destructive preview tool.

Initial scenarios:

- What if I contribute a different amount?
- What if I make a withdrawal?
- What if I switch strategy?
- What if I change a relevant constraint?

Preview results must never mutate the live ledger, strategy state or real action queue.

The UI should emphasize the difference between "preview" and "apply".

## Strategy flexibility

The UI must be generated from strategy capabilities rather than hard-coded around 9Sig.

A versioned strategy definition should be able to declare relevant inputs / capabilities such as:

- rebalance frequency
- target growth
- asset universe
- value-target parameters
- allocation bands
- moving-average periods
- momentum lookback
- defensive assets
- confirmation periods
- contribution treatment
- engine-specific onboarding fields

Adding a future strategy should not require redesigning the whole customer shell.

## Strategy versions and migrations

Published strategy versions remain immutable.

Existing customers stay pinned to their current version until an explicit migration is performed.

When a new version is available, show a simple upgrade experience:

> An updated version of your strategy is available.

Possible actions:

- Keep current version
- See comparison
- Upgrade

Comparison should show meaningful customer impact, including the immediate recommended action when possible.

Required migrations must be explicit, audited and safe.

## Pause, resume, switch and stop

Support lifecycle actions without deleting history.

### Pause

No new operational actions while paused. Existing history remains visible.

### Resume

Reconcile current holdings and recalculate the next valid action.

### Switch strategy

Use a controlled migration / transition flow. Do not overwrite the old strategy history.

### Stop

Close the active strategy instance while preserving history and performance records.

## Multiple accounts

Support one strategy spanning one or more investment accounts where appropriate.

Examples:

- ISA
- SIPP
- GIA
- other broker accounts

The customer dashboard should still present one strategy-level answer by default.

Account-level detail is shown only when required to execute the recommendation.

## Instrument availability and substitutions

A strategy targets an economic exposure, while regional / broker resolution chooses the valid trading line.

Where an exact product is unavailable:

- use only admin-approved substitutions
- clearly identify the actual instrument
- fail closed where equivalence has not been approved
- never silently substitute an unverified product

## Currency and FX

Keep cash balances isolated by currency.

Expose FX complexity only when it affects the customer's action.

Where conversion is required, show the customer-friendly result and the estimated FX effect if known.

Never assume two currencies are equivalent when market / FX data is missing.

## Contributions and withdrawals

Contributions and withdrawals are first-class external cash flows and must not be mistaken for investment performance.

Users can:

- set recurring expected contributions
- record irregular contributions
- skip a scheduled contribution
- change future contribution amount
- record withdrawals

The dashboard should adapt immediately.

## Premium visual direction

The app should feel premium, modern and calm rather than like a trading terminal or crypto dashboard.

Direction:

- dark-first visual language with excellent light-mode support
- spacious typography
- strong hierarchy
- soft depth / glass-like surfaces used selectively
- premium gradients and restrained glow
- crisp iconography
- large readable financial figures
- elegant chart treatment
- highly polished empty / loading / success states
- subtle depth and hover feedback
- consistent rounded geometry
- no visual clutter

Avoid:

- neon-everywhere crypto styling
- excessive blur
- gimmicky 3D effects
- bouncing controls
- unnecessary dashboards full of tiny cards
- animations that delay task completion

## Motion system

Motion should reinforce state changes.

Use:

- short page / section transitions
- card hover lift / depth
- number transitions for meaningful stat changes
- chart reveal / interpolation
- skeleton loading
- smooth progress indicators
- polished completion feedback
- subtle staggered reveals where appropriate

Requirements:

- respect prefers-reduced-motion
- animations must not block input
- avoid cumulative layout shift
- keep common transitions fast and responsive
- animation state must remain deterministic in tests

## Charts

Charts are a major product-quality feature.

The primary performance chart should support:

- strategy actual performance
- contributions
- QQQ buy-and-hold benchmark
- leveraged benchmark where applicable (e.g. 3QQQ)
- DCA-adjusted benchmark comparisons
- strategy-model comparison where meaningful
- selectable timeframes
- hover / touch inspection
- contribution / rebalance markers
- clear separation of user return from cash flows

Do not overload the default view. Start with the user's strategy and allow benchmarks to be toggled on.

## Dashboard composition

Recommended hierarchy:

1. top hero / portfolio summary
2. Today's Action
3. next review / contribution / allocation health
4. performance chart
5. recent activity

The Today's Action component is the visual and functional focal point.

## Error and recovery language

Avoid technical dead-end messages.

Bad:

> Reconciliation state invalid.

Better:

> Your holdings don't match our last recorded balance. Update them so we can calculate your next action.

Every recoverable error should offer one obvious next step.

For financial safety blocks, explain why the platform is refusing to guess.

## Plans and entitlements

Keep commercial plan configuration admin-controlled.

Product capabilities may include:

### Free

- one active strategy
- basic dashboard
- basic history
- no proactive notifications

### Investor / Standard

- up to three strategies
- notifications
- full history
- benchmark comparison
- expanded Explore features

### Pro

- higher / unlimited strategy allowance
- what-if tools
- advanced analytics
- multi-account functionality
- future premium tools

Exact names, prices and limits remain data/configuration, not hard-coded assumptions.

The UI must gracefully handle upgrades, downgrades and plan-limit conflicts.

## Admin requirements

Admin should be able to manage without code changes:

- plans
- plan prices / currencies
- entitlements
- strategy availability
- strategy versions
- migration status
- strategy-specific schemas / supported options
- instruments
- regional mappings
- approved substitutions
- feature flags
- user strategy limits
- provider health
- worker health

Admin complexity must not leak into customer navigation.

## Accessibility and trust

Premium design must remain accessible.

Requirements:

- keyboard navigable
- visible focus state
- sufficient contrast
- semantic labels
- screen-reader friendly action explanations
- reduced-motion support
- no color-only status communication
- mobile touch targets
- confirmation for financially meaningful destructive actions

## Responsive behavior

Design mobile-first for the core action flow.

On mobile:

- Today's Action remains immediately visible
- charts remain touch-browsable
- tables transform into readable cards / detail views where appropriate
- primary actions stay thumb-accessible
- navigation remains compact

Desktop may expose more context but must not become busier simply because space exists.

## Performance

Eye candy must remain fast.

Goals:

- no animation-heavy blocking hydration
- defer non-critical chart work
- keep the main action summary fast to render
- avoid unnecessary client-side fetching waterfalls
- maintain stable layouts
- optimize large history datasets
- preserve server-authoritative financial state

## Testing requirements

Add / preserve tests for:

### Strategy and accounting

- small portfolio rounding
- non-fractional execution
- minimum order size
- fee-aware execution
- FX blocking / conversion paths
- contribution-first rebalancing
- withdrawal handling
- partial execution
- missed rebalance
- pause / resume
- version migration
- strategy switch
- corrections / reversals
- multiple accounts
- stale-data blocking

### UX

Browser tests for:

- start-new onboarding
- resume-existing onboarding
- default Action Mode
- mark action completed
- partial completion
- what-if preview does not mutate live state
- Explore toggle
- mobile navigation
- reduced motion
- empty portfolio
- blocked financial action and recovery
- plan limit / upgrade path

### Visual quality

Where practical, add stable screenshot / visual regression coverage for the highest-value screens:

- onboarding
- dashboard
- Today's Action
- performance chart
- success state
- mobile dashboard
- dark and light modes

## Implementation sequence

Use this checklist as the shared cross-chat roadmap.

### Foundation / product model

- [x] audit current post-PR-2 customer flows before changing behavior
- [ ] formalize strategy / portfolio / execution / explanation boundaries
- [ ] add / extend customer constraint model
- [ ] add execution optimizer for practical trade recommendations
- [ ] add pause / resume / stop lifecycle where incomplete
- [ ] verify multi-account abstraction
- [ ] verify instrument-substitution safety path

### Onboarding

- [x] redesign onboarding into short visual stepper
- [x] implement Start flow
- [x] implement Resume flow from current snapshot
- [ ] preserve pre-platform / tracked-performance distinction
- [x] progressive advanced settings

### Action Mode

- [x] redesign main dashboard hierarchy
- [x] premium Today's Action card
- [x] concise plain-English explanation layer
- [ ] next-review / contribution / allocation health
- [ ] partial / actual execution capture
- [ ] polished success / recalculation flow
- [ ] recovery UX for drift and stale data

### Explore Mode

- [x] separate advanced analytics from Action Mode
- [ ] premium interactive performance chart
- [ ] benchmark toggles
- [ ] contribution / rebalance markers
- [ ] filters / timeframes
- [ ] detailed strategy explanation
- [ ] history and activity improvements

### What-if

- [ ] contribution preview
- [ ] withdrawal preview
- [ ] strategy-switch preview
- [ ] constraint-change preview
- [ ] guarantee non-mutating simulation path

### Strategy evolution

- [ ] customer-friendly update notification
- [ ] version comparison
- [ ] immediate-action impact preview
- [ ] audited upgrade / migration flow

### Visual system

- [ ] define premium design tokens
- [x] dark mode
- [x] light mode
- [ ] typography and number formatting
- [ ] cards / surfaces / gradients / depth
- [ ] icon system
- [x] animation / motion primitives
- [x] reduced-motion path
- [ ] loading / empty / error / success states

### Responsive / accessibility

- [ ] mobile-first dashboard
- [ ] responsive charts
- [x] compact navigation
- [ ] keyboard audit
- [ ] contrast audit
- [ ] screen-reader labels
- [ ] mobile touch-target audit

### Commercial experience

- [ ] keep plan definitions data-driven
- [ ] polished upgrade / downgrade flows
- [ ] graceful plan-limit handling
- [ ] keep admin configuration separate from customer UX

### Verification

- [ ] unit tests
- [ ] database / migration tests
- [ ] integration tests
- [ ] browser tests
- [ ] visual regression coverage for key screens
- [ ] lint
- [ ] TypeScript
- [ ] production build
- [ ] dependency/security audit
- [ ] final workflow-gap sweep
- [ ] final financial-safety sweep
- [ ] final simplicity review: can a new user understand the next action within 5 seconds?

## Definition of done

This PR is not complete merely when the new design renders.

It is complete when:

- a brand-new user can create a strategy with minimal information
- an existing investor can resume from a current snapshot without reconstructing unnecessary history
- small and large portfolios both produce practical actions
- contributions, withdrawals, missed events and partial trades recover cleanly
- the main dashboard makes the next action obvious within seconds
- advanced information remains available without cluttering the default experience
- strategy-specific behavior remains data / engine-driven
- new strategy versions cannot silently alter existing users
- animations feel premium and never impede usability
- mobile experience is fully usable
- accessibility and reduced motion are supported
- financial safety / reconciliation fail closed where data is uncertain
- CI, migrations, tests and production build are green
- a final post-implementation audit finds no known revenue, entitlement, financial, security or workflow blocker

## Cross-chat continuation protocol

This PR is intentionally suitable for continuation across multiple ChatGPT sessions.

When resuming work:

1. Read this document.
2. Inspect the latest PR head and all commits since the last checkpoint.
3. Read the current PR description / comments for newly discovered issues.
4. Pick the next unchecked coherent workstream.
5. Implement it on this branch; do not create a competing branch unless necessary.
6. Run relevant tests before pushing.
7. Update this checklist when a workstream is materially complete.
8. Record any deferred issue explicitly rather than silently omitting it.
9. Do not merge while known blockers remain.
10. Before merge, run the full release gate and a fresh holistic audit against this document.

The goal is one coherent product-experience PR, not a collection of disconnected cosmetic patches.


## Implementation checkpoint — 7 October 2026

Completed in the first implementation pass on this PR:

- customer navigation reduced to Home / Portfolio / Activity / Explore / Settings
- home dashboard redesigned around one dominant Today action
- no-strategy state converted into a single first-strategy onboarding CTA
- strategy setup converted from one long form into a three-step visual flow
- Start and Resume paths made explicit; Resume continues into the existing opening-snapshot workflow
- advanced account details progressively disclosed rather than shown by default
- individual strategy screen redesigned around the next action, current value and next review
- performance, ledger history, reconciliation and lifecycle controls moved behind progressive detail drawers
- portfolio and activity surfaces simplified
- premium interaction / hover / reveal treatment added
- keyboard focus treatment added
- prefers-reduced-motion path added

Still intentionally open: execution-constraint model, contribution-first optimizer, what-if engine, version-comparison UX, richer benchmark controls, visual regression suite, full accessibility/mobile audit and the final release/safety sweep.
