# Oracle VM / Docker deployment (manual-data first)

This guide does **not** imply the app is ready to charge customers. First complete the production and product-safety checks.

## Design

- `docker-compose.oracle.yml` runs PostgreSQL 16 (private Docker network), the Next.js app (bound only to VM loopback), and an hourly scheduler (private network).
- Put a TLS reverse proxy such as Traefik or Caddy in front of `127.0.0.1:3000`. Keep port 5432 closed to the public.
- Copy `.env.example` to a private `.env.production` (mode 0600). Supply `POSTGRES_PASSWORD` in the Compose shell environment or in a securely permissioned Compose `.env` file; `DATABASE_URL` inside the app is provided by Compose.
- Set `MARKET_DATA_MODE=MANUAL` and leave `MARKET_DATA_PROVIDER` unset to indicate user-entered prices. Manual prices and ledger events must still be validated and timestamped, and users must not be led to believe the platform fetched live quotes.
- For paid accounts supply authentic Stripe keys, webhook signing secret and plans; for email provide a legitimate HTTPS email provider. Manage those values through environment or host secret management, not a plaintext admin database field.
- `docker compose -f docker-compose.oracle.yml --env-file .env.production build` builds the app.
- Before first start, use a controlled one-off release step: `docker compose -f docker-compose.oracle.yml --env-file .env.production run --rm app npm run db:migrate`; repeat for `npm run db:seed`.
- `docker compose -f docker-compose.oracle.yml --env-file .env.production up -d` launches the services. Verify `/api/health`, dashboard login, Stripe webhook and worker statuses.
- `npm run launch:preflight` evaluates configured launch gates; it does not establish live provider health or legal status.

## Backups and monitoring

- Store encrypted PostgreSQL backups off the Oracle VM; do not rely solely on the Docker named volume or Oracle VM snapshots.
- Add a real backup worker / off-site uploader using a secret store, retention policy and tested restore drill before launch.
- Monitor `/api/health`, scheduled worker execution, SMTP failures and Stripe webhook processing with off-host alerting.
- Never mark `BACKUPS_RESTORE_VERIFIED`, `REGIONAL_INSTRUMENTS_VERIFIED` or `UK_REGULATORY_SIGNOFF_VERIFIED` true without documented verification.

## Manual-data scope caveat

The existing portal still has price-entry, broker reconciliation and regional-mapping workflows with different readiness assumptions. Setting `MARKET_DATA_MODE=MANUAL` is a **configuration declaration**, not proof that all customer strategy workflows work without quotes. Complete manual-data end-to-end tests before inviting users.

## UK regulatory perimeter

Manual entry and user-selected strategies reduce the chance of regulated investment advice, but automatic instrument-specific buy/sell guidance may still be considered a recommendation depending on how it is presented. A disclaimer alone is insufficient. Obtain a proportionate specialist review of actual product flows and marketing, not a presumed full FCA authorisation.
