# Security notes

Implemented controls include:
- bcrypt password hashes
- production email verification and one-time reset tokens stored as hashes
- JWT sessions through Auth.js
- same-origin checks on sensitive registration mutation
- database-backed rate limiting for account creation and reset requests
- secure response headers
- signed Stripe webhook verification
- AES-256-GCM encryption for Discord webhook secrets
- server-side entitlement enforcement
- no production market-data fabrication
- customer data export and deletion
- anonymous aggregate opt-out
- admin views that avoid portfolio balances by default
- dependency audit in CI

Before production, add infrastructure-level rate limiting / WAF rules, managed secret storage, database backups, observability with sensitive-field redaction, a licensed market-data provider and a formal security review.
