# Security notes

Implemented controls include:
- bcrypt password hashes
- production email verification and one-time reset tokens stored as hashes
- JWT sessions through Auth.js
- fail-closed production same-origin checks on state-changing customer/admin mutations
- database-backed rate limiting for account creation and reset requests
- secure response headers
- signed Stripe webhook verification with concurrency-safe event claiming and canonical ownership fallback
- AES-256-GCM encryption for Discord webhook secrets
- server-side entitlement enforcement, including send-time notification-channel rechecks
- no production market-data fabrication
- customer data export and deletion
- anonymous aggregate opt-out
- admin views that avoid portfolio balances by default
- retry-safe financial mutation keys for user-entered cash/reconciliation writes
- DB-backed readiness health checks and degraded worker signaling
- dependency audit in CI

Before production, add infrastructure-level rate limiting / WAF rules, managed secret storage, database backups, observability with sensitive-field redaction, a licensed market-data provider and a formal security review.
