# StrategyOS / 9sig repository

This repository is a modular-monolith SaaS for operating user-selected, rules-based investment strategies. The repository name can remain 9sig, but the product architecture is not tied to 9Sig.

The product is built around three questions:

1. Where am I?
2. Do I need to do anything?
3. Exactly what do I need to do next?

It separates strategy definitions from versioned strategy rules, user strategy instances, source ledger events, derived calculations, reversible overrides, actions and notification delivery.

## Current launch scope

Implemented foundations include authentication, Free / Investor / Pro entitlements, versioned strategies, multiple strategy instances per user, append-only ledger events, cash as a first-class position, quick resume, reconciliation adjustments, regional instrument mapping, action lifecycle and explanations, notification dedupe, Stripe subscription state, public aggregate plumbing, demo mode, customer dashboards and admin views.

The active seed enables the 9Sig-family value-target engine. Fixed-allocation engines exist and are tested, but HFEA / Golden Butterfly definitions are deliberately disabled until faithful regional instruments and full multi-leg execution workflows are configured. Momentum and custom-strategy authoring are extension points, not fake features.

Production market data deliberately fails closed until a licensed provider is configured. The development mock provider cannot fabricate production prices.

## Stack

- Next.js and React with TypeScript
- PostgreSQL
- Drizzle schema definitions plus reviewed SQL migrations
- Auth.js
- Decimal.js for accounting calculations
- Recharts and Framer Motion-ready UI foundation
- Stripe
- Docker
- GitHub Actions

## Local development

Requirements: Node 22+, PostgreSQL 16+.

    cp .env.example .env.local
    npm install
    npm run db:migrate
    npm run db:seed
    npm run dev

Generate an Auth.js secret using a cryptographically secure random value. APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key. CRON_SECRET protects the action and notification worker.

## Verification

    npm run lint
    npm run typecheck
    npm test
    npm run build

CI additionally applies the migration twice to prove idempotency, seeds a fresh PostgreSQL database and runs a production dependency audit.

## Stripe test setup

Create monthly and annual Stripe Prices for the Investor and Pro plans. Put the Price IDs into the plan records through the admin API. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, then point Stripe to POST /api/stripe/webhook.

The webhook is the authority for paid subscription status. Feature access comes from the canonical entitlement service, not scattered Stripe checks.

## Notifications

In-app notifications exist on every plan. Investor and Pro may use Email and Discord according to their plan entitlements. Discord webhook destinations are encrypted at rest. notification_deliveries has a unique dedupe key, so worker restarts cannot resend the same delivery record.

## Market data

src/lib/market-data.ts defines the provider interface. Production returns unavailable data unless a real provider is configured. Financial action calculation fails closed on missing or stale critical data.

## Deployment

Build the Docker image after migrations have been applied. Run db:migrate and db:seed as controlled release steps before switching application traffic. Configure the hourly /api/cron/actions worker with Authorization: Bearer CRON_SECRET.

## Security and regulatory posture

Financial information is treated as sensitive. The application uses server-side validation, signed Stripe webhooks, secure headers, rate limiting for account flows, encrypted notification secrets and audit events.

The application does not select a strategy based on suitability. Customer-facing wording describes the output as a calculation under rules the user selected. Jurisdiction-specific legal and regulatory review remains required before launch.

See docs/ for the detailed architecture and methodology notes.
