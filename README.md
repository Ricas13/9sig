# 9Sig Journey

A deliberately simple, single-page 3QQQ 9Sig journey tracker.

The visible product answers three questions:

1. **What do I do now?** — Do nothing / add contribution / buy / sell / skip / reset.
2. **Where am I?** — 3QQQ, CSH2, total portfolio, mode, next contribution and next signal.
3. **How is it going?** — one chart comparing QQQ + DCA, 3QQQ + DCA and the user's real 3QQQ 9Sig + DCA journey.

Everything else is deliberately collapsed below the main flow.

## Included in this MVP

- Email/password accounts (Auth.js credentials + bcrypt).
- One isolated portfolio per user.
- Owner bypass via `OWNER_EMAIL` while the product is private.
- Stripe subscription gate ready for a **$20/month** Price ID.
- 3QQQ + CSH2 holdings and manual broker reconciliation.
- Contextual action card: only asks for information needed now.
- Quarterly 9Sig target: previous signal base × 1.09 + 50% of new contributions.
- 90% reserve buy throttle.
- Reconstructed 30-Down state: buys continue, two sell signals skipped, reset on the following sell, ~8-quarter maximum.
- Spike-reset check.
- QQQ + DCA vs 3QQQ + DCA vs actual 9Sig comparison chart.
- Encrypted per-user Discord webhook and daily cron route that sends one notification on an outstanding signal day.
- Market-data provider fails closed: if a price cannot be obtained, the app asks the user to confirm it.

## Stack

- Next.js 16 Active LTS / React 19
- PostgreSQL using `postgres`
- Auth.js credentials sessions
- Stripe Checkout + Billing Portal
- Recharts
- Yahoo Finance chart endpoint as a **best-effort market-data source**, with manual price/reconciliation fallback

## Local setup

Requires Node.js 22+ and PostgreSQL.

```bash
cp .env.example .env.local
# edit .env.local
psql "$DATABASE_URL" -f db/schema.sql
npm install
npm run dev
```

Generate an Auth.js secret with:

```bash
npx auth secret
```

Generate the Discord encryption key with:

```bash
openssl rand -base64 32
```

Set your own email in `OWNER_EMAIL`. That account bypasses Stripe so you can use and test the product before enabling subscriptions.

## Stripe

Create one recurring Stripe Price for **$20/month** and set `STRIPE_PRICE_ID`.

Configure the webhook endpoint:

`POST /api/stripe/webhook`

Recommended events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The database subscription state is updated only from signed Stripe webhook events.

## Discord signal-day alerts

Set `CRON_SECRET` and `DISCORD_ENCRYPTION_KEY`. Vercel cron is configured to call:

`GET /api/cron/rebalance`

at 18:10 UTC each day. The handler only sends an alert when a user's next quarterly signal is outstanding and uses `notification_events` to prevent duplicate alerts.

If your hosting platform does not attach `Authorization: Bearer $CRON_SECRET` automatically, call the route from your own scheduler with that header.

## Important product notes

This repository intentionally does **not** place trades, connect to a brokerage account or silently trade on behalf of users. Users confirm contributions/trades and can reconcile the calculated position to their broker.

Before selling access to the public, obtain appropriate legal/compliance advice for the jurisdictions in which the service will be offered. A paid tool that produces specific investment signals can raise financial-promotion/advice/regulatory questions depending on how it is marketed and operated.

## Market-data note

The included Yahoo chart provider is fine for an MVP and has a manual fail-safe, but it is not a contractual commercial market-data feed. Before charging customers, replace or supplement it with a licensed/reliable data provider and keep the same `market.ts` interface.
