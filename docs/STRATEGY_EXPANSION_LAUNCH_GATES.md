# Strategy expansion and commercial launch gates

This page is a **work queue**, not a certification of production readiness. The platform must not represent research presets as live strategies until the gates below pass.

## Research and source fidelity

Reference strategy records are in `src/domain/strategy/research-catalog.ts`. Sources are research pointers, not endorsements. Reddit is useful for clarifying practice and disputed variants, but published author specifications are the authority where available.

- [x] Reference definitions for HFEA, Golden Butterfly, Permanent Portfolio, All Weather, three-fund, 60/40 and 80/20
- [x] Distinguish canonical HFEA 55/45 UPRO/TMF from TQQQ/TMF modifications
- [x] Record strict research-only status for 3Sig, 6Sig, dual momentum, GTAA/Ivy, PAA and VAA
- [ ] Independently verify every primary-source rule and trading/calendar convention
- [x] Add a research-stage fail-closed relative/absolute momentum rotation engine and unit test fixtures (not wired to live data)
- [ ] Integrate licensed historical prices into EngineContext, handle corporate actions and calendars, and independently backtest momentum signal engines with no look-ahead
- [ ] Verify source-specific 3Sig and 6Sig formulas; do not guess
- [ ] Add safe advanced custom strategy editor with JSON schema validation, permissions, version diffs, immutable publication and restricted operator sandbox
- [ ] Run independent golden-case regression tests against primary source examples
- [ ] Publish strategy-specific disclosures including leverage and volatility decay
- [ ] Verify economic exposure, currency, wrapper eligibility, fractional trading and *actual purchasability* by region and broker; never automatically substitute a similar ticker
- [ ] Establish commercial data/licensing rights before production activation
- [ ] User-acceptance tests for every supported strategy (start/resume/rebalance/fees/recovery/withdrawals)

## Deployment and revenue gates

- [ ] Select production host/domain, HTTPS, Postgres with PITR and separate staging database
- [ ] Manage credentials in secret store: Auth.js, DB, application encryption, worker auth, Stripe keys, signed webhooks, email and market data tokens
- [ ] Provision and smoke-test real transactional email with DNS SPF/DKIM/DMARC, resets, verification, delivery failures
- [ ] Configure Stripe catalogue/GBP monthly/annual prices; test webhook ordering, replays, retries, cancellation, proration, failed collection and downgrade
- [ ] Integrate contracted HTTPS quote and historical data service; verify rates, timestamp/currency/FX accuracy, corporate actions, out-of-hours and error handling
- [ ] Provision protected scheduler with singleton/concurrent-run control; monitor delayed jobs, delivery idempotency and end-to-end alert latency
- [ ] Configure metrics, traces, structured redacted logs, uptime probes, security alerts and escalation on errors/failed payments
- [ ] Encrypted off-site backups, retention policy, tested point-in-time restore and recovery time targets
- [ ] Harden CDN/WAF, rate limiting, CSP, least-privilege access, admin 2FA, vulnerability patching and penetration review
- [ ] Staged rollout, deployment health gate, rollback runbook and post-deploy acceptance test
- [ ] Independent UK review of FCA perimeter, financial promotions, consumer protection, subscription terms, GDPR/privacy, data licensing and tax-related presentation before charging customers
- [ ] Confirm company ownership, support mailbox, refund/contact/privacy policies and business continuity

**Operating rule:** Green CI proves software checks passed, not market-data accuracy, regional product eligibility, investment methodology authenticity, legal approval or production readiness. No automatic broker trades are authorised by these research definitions.
