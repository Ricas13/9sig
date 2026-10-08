# Oracle Docker production deployment (automatic market prices)

This is a deployment and verification runbook, not a claim that strategy calculations, subscriptions, legal obligations or external services have passed production testing.

## Preflight

- Obtain an Oracle VM with SSH access, non-root deployment user, firewall and sufficient RAM/disk/CPU.
- Set `NEXT_PUBLIC_APP_URL` to a real HTTPS origin; terminate TLS through a reverse proxy pointing to `127.0.0.1:3000`. Do not publish PostgreSQL port 5432.
- Keep `PUBLIC_INDEXING_ENABLED=false` until launch verification is complete. Check `/robots.txt` and `/sitemap.xml`.
- Copy `.env.example` to a private `.env.production` with file mode 0600. The Docker build context excludes environment files. **Never commit secrets**.
- Configure `POSTGRES_PASSWORD` and a matching `DATABASE_URL` using `db:5432`; URL-encode reserved characters in the password.
- Store encryption, authentication, scheduler, Stripe, transactional email and market-data secrets securely. Enable HTTPS transport for all externally configured provider endpoints.
- Run the platform's `npm run launch:preflight` after setting production credentials. This checks configuration but does not prove the correctness of financial data or live service behaviour.

## First deployment

```bash
docker compose -f docker-compose.oracle.yml --env-file .env.production build
docker compose -f docker-compose.oracle.yml --env-file .env.production run --rm app npm run db:migrate
docker compose -f docker-compose.oracle.yml --env-file .env.production run --rm app npm run db:seed
docker compose -f docker-compose.oracle.yml --env-file .env.production up -d
```

Verify app health, login, actual historical and current provider observations, dated strategy calculation, Stripe webhooks, email/Discord delivery and scheduler execution before enabling paid signups.

## Encrypted off-site PostgreSQL backup

The optional `backup` profile uses restic, `pg_dump` in PostgreSQL custom archive format, and client-side authenticated encryption.

1. Configure `RESTIC_REPOSITORY` to a separate remote object store (S3-compatible, B2 or other restic-supported backend). Set `RESTIC_PASSWORD` and provider-specific storage credentials with least privilege in `.env.production`. Keep an **independent offline record** of the restic encryption password and recovery procedure.
2. Initialise the repository once:

```bash
docker compose -f docker-compose.oracle.yml --env-file .env.production --profile backups run --rm --entrypoint restic backup init
```

3. Start the optional backup sidecar (database must already be started):

```bash
docker compose -f docker-compose.oracle.yml --env-file .env.production --profile backups up -d
```

4. The backup sidecar encrypts and uploads a compressed custom-format dump, retains 7 daily, 4 weekly and 6 monthly restic snapshots of this application, and writes a local success marker **only after** backup and retention commands succeed. Docker marks its health unhealthy if that marker is missing or older than 26 hours. The profile is opt-in so a missing backup destination cannot be mistaken for a configured working backup.
5. Verify an actual restore into a **separate** PostgreSQL database before setting `BACKUPS_RESTORE_VERIFIED=true`. Do not perform a restore directly against the live production database. Record the restoration date, snapshot ID, tables checked, RTO and RPO.
6. Monitor Docker health and alert remotely if `backup` becomes unhealthy, stops, or fails to upload. Oracle instance snapshots alone are not an adequate off-site backup.

## SEO public launch

Set `NEXT_PUBLIC_BRAND_NAME=Rebalune`; the GitHub source repository may remain `Ricas13/9sig`. Trademark/domain clearance still needs to be independently confirmed before public launch. Configure `GOOGLE_SITE_VERIFICATION` and verify the production domain. After the site and policies are reviewed, set `PUBLIC_INDEXING_ENABLED=true` and redeploy. Then verify `/robots.txt` and `/sitemap.xml`, submit the sitemap to Search Console, and run Lighthouse/Core Web Vitals checks. See `docs/COMMERCIAL_SEO_LAUNCH.md`.

## Still required before commercial launch

Provider contracts and tested rights to redistribute/use market quotes in a paid product; actual intraday history and split/FX coverage; all offered strategy engines independently validated; audit-corrected broker fills and scheduled notifications tested end-to-end; service legal/privacy/terms and UK product perimeter review; production billing, refunds and support; security and restore drills. Docker health, green CI and SEO readiness do not replace these checks.
