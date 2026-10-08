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
5. Verify an actual restore into a **separate** PostgreSQL database before setting `BACKUPS_RESTORE_VERIFIED=true`. Do not perform a restore directly against the live production database. Record the restoration date, snapshot ID, tables checked, RTO and RPO. `scripts/restore-drill.sh` does this: it restores the chosen snapshot (default: latest) into a scratch database, refuses to touch the live one, checks the restored schema and key tables, drops the scratch database and writes a JSON report with the snapshot ID, tables checked and RTO. It needs `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` and `PG*` variables for a role that may `CREATE DATABASE`; `DRILL_DUMP_FILE=<dump>` rehearses it against a local `pg_dump --format=custom` file. A person still has to run it against the real off-site repository and keep the report.
6. Monitor Docker health and alert remotely if `backup` becomes unhealthy, stops, or fails to upload. Oracle instance snapshots alone are not an adequate off-site backup.

## SEO public launch

Set `NEXT_PUBLIC_BRAND_NAME=Wealtharr`; the GitHub source repository may remain `Ricas13/9sig`. Trademark/domain clearance still needs to be independently confirmed before public launch. Configure `GOOGLE_SITE_VERIFICATION` and verify the production domain. After the site and policies are reviewed, set `PUBLIC_INDEXING_ENABLED=true` and redeploy. Then verify `/robots.txt` and `/sitemap.xml`, submit the sitemap to Search Console, and run Lighthouse/Core Web Vitals checks. See `docs/COMMERCIAL_SEO_LAUNCH.md`.

## Still required before commercial launch

Provider contracts and tested rights to redistribute/use market quotes in a paid product; actual intraday history and split/FX coverage; all offered strategy engines independently validated; audit-corrected broker fills and scheduled notifications tested end-to-end; service legal/privacy/terms and UK product perimeter review; production billing, refunds and support; security and restore drills. Docker health, green CI and SEO readiness do not replace these checks.

## Sign in with Google / Apple

Buttons appear on the sign-in and register pages only for providers whose variables are set (see `.env.example`). Not exercised against the live providers yet: do that on staging before enabling in production.

1. Register the redirect URIs `https://<domain>/api/auth/callback/google` and `/apple` with each provider, and set `AUTH_URL=https://<domain>`.
2. Apple needs HTTPS, a Services ID (`AUTH_APPLE_ID`), and either a ready client secret or the team ID, key ID and private key (a secret is generated at start-up and lasts 150 days, so restart at least that often).
3. Account rules (tested in `tests/db/oauth-sign-in.test.ts`): a provider is matched by its own subject id; an existing account is linked by email only if the provider says the email is verified; an account that was never email-verified loses its password when claimed this way; administrators and accounts with two-step sign-in cannot use a provider and must use password + code; deleted accounts are never revived.
4. Providers deliberately not added: Microsoft, GitHub and Facebook do not reliably vouch for the email address they return, and linking on an unverified email would allow account takeover.

## Configuring from the browser instead of environment files

Only four values stay in the server environment because the app cannot start without them: `DATABASE_URL`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY` and `AUTH_TRUST_HOST=true`. Everything else (Stripe, email, market data, Google/Apple sign-in, launch sign-offs, worker tuning, product name, public address) is managed in **Admin › Settings**.

- First run: with no administrator, the server prints a line starting `[setup]` containing a one-time code. Open `/setup`, enter the code and create the first administrator. The page then closes permanently. The public address is saved automatically from the address you used.
- Saved values are encrypted with `APP_ENCRYPTION_KEY` (do not lose or rotate it without re-entering them), override a same-named environment variable, and apply within about 15 seconds. Clearing a value falls back to the environment file.
- Secrets are write-only: the screen shows whether one is set, never the value. Changes are audited by key name only.
- Two guards prevent self-lockout: the public address must be the one you are currently using, and "require admin two-step sign-in" cannot be switched on until your own account has it.

## Rebrand rollout notes

The product brand is **Wealtharr** while the GitHub repository remains `Ricas13/9sig`; strategy key `9sig`, existing PostgreSQL names, Stripe idempotency identifiers and backup snapshot tags intentionally remain stable. On existing installs set `NEXT_PUBLIC_BRAND_NAME=Wealtharr` (or clear the old admin override); old saved default brand values are normalized at runtime. Replace `REBALUNE_PAID_LAUNCH_ENABLED` with `WEALTHARR_PAID_LAUNCH_ENABLED=false` until a separately approved paid launch. Renew and verify OAuth domains, Stripe callback settings, email-sender identity, search verification, mobile association files and deployment DNS once the actual owned HTTPS domain is configured. Existing mobile store app IDs should not be changed on already published binaries without a store migration plan.
