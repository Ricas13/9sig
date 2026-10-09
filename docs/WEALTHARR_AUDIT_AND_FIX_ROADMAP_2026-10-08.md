# Wealtharr — production-readiness code audit and fix roadmap

> **Historical document.** It describes the repository as audited on 2026-10-08, before most items were fixed. The current status of every item, with evidence, is in [`STATUS.md`](STATUS.md).

**Audit date:** 2026-10-08. **Scope:** targeted static review of PR #4 head `89edd01b287d30cbbf6caab9bd416e64e0f2fa59`, critical finance, auth, billing, admin, market data, scheduling, notification, Docker and SEO paths; GitHub Actions CI run #833. This is **not** a penetration test, validated market-data integration, live Stripe exercise or a claim that the full repository is defect-free.

## CI finding

**CI-01 (confirmed, release blocking):** #833 failed in `npm run test:e2e`: **mobile and desktop landing and demo visual regression checks** compare the new Wealtharr images with pre-rebrand SHA-256 reference pixels in `tests/e2e/visual.spec.ts`. Remaining functional e2e tests shown by the run passed. Fix by inspecting attached screenshots against approved design, updating reviewed baseline snapshots, running both browser projects again and preserving visual regression enforcement. Do not simply disable the checks.

## P0 — financial correctness and central product promise

**FIN-01 · unrestricted financial overrides (confirmed)**

- `src/app/api/strategies/[id]/overrides/route.ts`: accepts arbitrary `fieldKey` and `manualValue` with no field whitelist, positive finite Decimal constraint, currency, instrument, freshness, reason minimum or automatic-value authentication. Writes active override but does not invoke `recalculateAfterMutation`.
- `src/lib/action-service.ts` reads `strategy_state.targetValue` and `market_price:<instrumentId>` directly into Decimal/valuation. Malformed, zero or negative values can throw, block or distort calculations.
- Fix: Zod discriminated, per-field schema; finite positive price and nonnegative target; instrument belongs to the strategy; quote provenance from server not client; mandatory reason/expiration; append-only audit; transactionally change override then force recalculation. Add hostile input, expiry, ownership and idempotency tests.

**FIN-02 · price-derived actions reuse stale notification identity (confirmed)**

- `src/domain/action-fingerprint.ts` omits market observation version/price and calculated amount. `src/lib/action-service.ts` updates `actions.amount`, `instruction`, `next_state` for the same fingerprint, while `actionRecalculationDisposition` and unique notification records keep the original email/Discord content.
- Fix: define immutable revisions or material-change thresholds. Ensure displayed action, quote/version, acknowledgment, audit evidence and notification all identify the **same** calculation. Unchanged material events must still dedupe. Test price changes after acknowledgment, notification sending, and a correction.

**FIN-03 · manual valuation overrides do not drive order sizing (confirmed)**

- `src/lib/action-service.ts` values positions using the `market_price:<instrumentId>` override but computes `planPracticalTrade` with the original cached provider quote (`price:String(quote.price)`).
- Fix: use a single validated, typed and provenance-tagged effective price throughout valuation, sizing, cash/quantity calculations, fingerprint and UI. Require explicit user confirmation before relying on corrected prices. Test different 100/110 price inputs produce mathematically consistent quantity/value.

**FIN-04 · historical buy → review journey not integrated (implementation gap, release blocking)**

- `src/app/api/market/historical/route.ts` returns a price reference but does not persist a transaction or immutable quote reference. `src/app/api/actions/[id]/execute/route.ts` has no actual timestamp input; `src/lib/action-service.ts` writes trade ledger `occurred_at=now()`. Opening snapshots also use `now()`.
- Fix: add authenticated past trade entry with timestamp/exchange timezone and instrument ID, auto-lookup historical market observation, broker fill confirmation and fee/FX capture, ledger provenance, corporate-action processing, strategy-specific review date, notification and corrected re-evaluation. Golden end-to-end example: TQQQ bought 2026-11-02 14:00 America/New_York, reviewed 2027-02-02 under an explicitly quarterly strategy.

**FIN-05 · UTC trading date used for historical line eligibility (confirmed edge-case)**

- The historical lookup uses `at.toISOString().slice(0,10)` for effective trading-line date, which may differ from the **exchange-local** session date (e.g., a West Coast evening timestamp).
- Fix: map the timestamp through exchange timezone/trading calendar, validate DST and market sessions, and test day/month/year boundary cases.

## P1 — billing, lifecycle, operational safety

**BILL-01 · public price may differ from charged Stripe price (confirmed)**

- `src/app/pricing/page.tsx` displays legacy `plans.monthly_price_minor/annual_price_minor`; `src/app/api/billing/checkout/route.ts` selects the active `plan_prices.stripe_price_id`; the homepage separately uses `COALESCE(pp.amount_minor,p.monthly_price_minor)`.
- Fix: use a canonical published `plan_prices` view for homepage, pricing and checkout; retrieve/verify Stripe Price currency, interval, amount and active state before activating an admin price. Assert equality in integration tests and protect existing subscriptions from inadvertent price mutation.

**BILL-02 · subscription webhooks can regress state when delivered out of order (confirmed missing guard)**

- `src/app/api/stripe/webhook/route.ts` applies signed `customer.subscription.*` objects without checking last-applied event time/version or refetching canonical Stripe state. A late old event may overwrite a newer subscription status.
- Fix: enforce per-subscription ordering with database lock and Stripe API canonical verification for ambiguous events; test reversed delivery, duplicates, cancellation and failed payments.

**BILL-03 · webhook ownership trusts user metadata without cross-checking customer (confirmed missing validation)**

- `resolveSubscriptionUserId` trusts `subscription.metadata.userId` before looking at local Stripe customer/subscription ownership. The user ID should never be authoritative without matching canonical Stripe customer records.
- Fix: validate membership of Stripe customer, subscription and user before granting entitlements; reject conflicting metadata, fail closed and audit.

**BILL-04 · external account deletion happens before local persistence (confirmed)**

- `src/app/api/account/delete/route.ts` deletes Stripe customer/cancels subscription before local database transaction, so a subsequent local DB failure leaves a live account with billing identity deleted.
- Fix: durable deletion state machine/outbox, external calls with idempotency, retries/compensation, and irreversible purge only after an audited completion checkpoint; test Stripe success + DB failure and reverse case.

**OPS-01 · unbounded sequential worker with request timeout (confirmed architecture risk)**

- `src/app/api/cron/actions/route.ts` refreshes all enabled symbols and sequentially recalculates **every** active instance, generates deliveries/aggregates in one HTTP invocation. Oracle Compose scheduler caps curl at 180 seconds and runs hourly. No persistent cursor, batch pagination or progress checkpoint.
- Fix: durable job queue/batch lease, bounded concurrency/rate limits, incremental checkpoints, heartbeat, idempotent retries, execution budgets and critical-job alerting. Simulate 100/1,000/10,000 active users; verify timely reminders and restarts.

**OPS-02 · retry loop can run indefinitely; no send deadlines (confirmed)**

- `src/lib/notification-service.ts` changes a failed send back to PENDING after a fixed 15 min, with no maximum attempts, dead-letter state or exponential backoff. `src/lib/email.ts` and Discord sender lack explicit request timeouts.
- Fix: 429 Retry-After, backoff/jitter, bounded attempts, dead-letter/outbox, admin requeue and visible reason, provider timeouts and notification SLA tests.

**OPS-03 · operational OK ignores partial quote-refresh failures (confirmed)**

- `src/app/api/cron/actions/route.ts` determines HTTP status solely using `calculationFailures===0`; `refreshMarketData` can return `failed>0` or `configured:false`, yet the run may say healthy.
- Fix: separate operational health from calculated action readiness, elevate partial data failures to degraded alert with structured metrics, and preserve fail-closed per-strategy actions.

**OPS-04 · backup and runtime readiness require real restoration (not verified externally)**

- Oracle profile contains private DB and optional restic offsite sidecar. Its build/Compose checks are useful, but neither prove that a restic repository, storage permissions, rotation, restores and recovery alerting actually work on an Oracle VM.
- Fix: restore drill into separate DB; verify RPO/RTO; alert on missed snapshot, store-independent credentials and tested startup rollback/release procedure.

**ADMIN-01 · draft/publish/retire lifecycle race (confirmed)**

- `src/app/api/admin/strategies/route.ts` reads draft status and checks duplicate effective dates before the publish transaction. `UPDATE_DRAFT` and `PUBLISH` SQL do not assert expected lifecycle state in `WHERE` and no version row lock protects the initial read. Simultaneous admins can overwrite a published version or publish conflicting versions.
- Fix: serialize same strategy definition/version with `SELECT ... FOR UPDATE` inside one transaction; conditional updates, unique DB constraint for published effective dates, immutable published JSON and concurrent-operator tests.

**ADMIN-02 · input schema silently converts invalid booleans and accepts impossible dates (confirmed)**

- `src/domain/strategy/config.ts` converts any unrecognised boolean input to `false`, uses only a format regex for dates, and permits duplicate keys and select-option values.
- Fix: strict typed validation, calendar-aware ISO dates, duplicate checks, bounded schema fields and consistent client/server error responses. Regression-test negative cases.

**SEC-01 · admin security hardening outstanding (release gate)**

- `src/auth.ts` has password/JWT login and account DB role checking. Strong admin MFA, login anomaly alerts, session revocation and security-incident procedures are not evident in the reviewed paths.
- Fix: require passkey/TOTP for admins; rate limits by account and trusted proxy IP; session invalidation, audit and permission-focused tests; security review before enabling commercial data access.
- **Status (code):** TOTP two-step sign-in is built and tested (RFC 6238 vectors, replay protection, one-time recovery codes, audit events, password + code needed to turn it off). It is opt-in per account; set `ADMIN_MFA_REQUIRED=true` once every admin has enrolled and admin tools then refuse admins without it (they can still reach their own settings to enrol, so nobody is locked out). Rate limits key on the proxy-appended address (`TRUSTED_PROXY_HOPS`). Owners are now emailed when their password is changed, two-step sign-in is turned on or off, or a Google/Apple sign-in is linked (best effort, audited). A sign-in from a browser/OS the account has not used before is also emailed (coarse device label only; no IPs or full user agents stored). TOTP satisfies the roadmap's "passkey/TOTP" requirement; passkeys themselves and an independent security review remain open.

## P2 — UX, SEO, validation and product breadth

- Review market-price data licence/adjustment semantics, FX/dividend/split handling and UK ISA broker availability; strategy research labels cannot be treated as verified execution capability.
- Complete independent golden-case testing for each actually offered strategy (9Sig, fixed allocation, momentum etc.), including drift/cash/fees and contribution timing.
- Confirm `NEXT_PUBLIC_BRAND_NAME=Wealtharr` on Oracle and clear brand/domain use; audit remaining hard-coded legacy internal labels only as operational convenience.
- Validate search sitemap/canonicals, structured data pricing, Google Search Console, legal/privacy pages and accessibility on final domain.
- Expand e2e tests to provider price ingestion, quote override → action revision → notification, Stripe payment state and off-site restore. The existing tests heavily exercise pure domain functions and onboarding but not the whole external-service user journey.

## Recommended release order / acceptance criteria

| Milestone | Required tasks | Evidence to close |
|---|---|---|
| **0. Make CI honest and green** | CI-01 review screenshot changes; do not disable visual guard; run migration/build/e2e/dep audit | All required checks green on exact PR SHA |
| **1. Protect monetary truth** | FIN-01/02/03 and ADMIN-01/02 | Hostile input, concurrent writes, quote change & revision tests green |
| **2. Complete the real user journey** | FIN-04/05, provider history, calendar, corporate actions and strategy validation | Repeatable TQQQ date-to-date example with correct notification, fills and recalculation |
| **3. Protect subscription revenue** | BILL-01/02/03/04 | Stripe test-mode webhook replay, out-of-order, pricing match and recovery tests |
| **4. Reliable operations and Oracle** | OPS-01/02/03/04 and SEC-01 | Staging load/restart test, MFA, monitoring alerts, encrypted restore, prod-configuration check |
| **5. Controlled commercial launch** | Verified data agreement, legal/privacy/support, SEO & brand clearance | Signed operator acceptance and documented go/no-go |

**Release rule (as written at the time; PR #4 has since been merged, see STATUS.md):** PR #4 remained Draft and unmerged until step 0 passes and all P0 defects are fixed, with independent validation of launch strategies and recorded staging acceptance. A green CI alone does not satisfy steps 2–5.
