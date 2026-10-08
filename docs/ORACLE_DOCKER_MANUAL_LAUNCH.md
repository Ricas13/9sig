# Oracle Docker deployment: automatically tracked market prices

The portal is a user-directed, rules-based investment tracker. Users input trades, contributions, and corrections; the platform automatically requests both historical intraday observations and ongoing current quotes.

## Intended experience

1. User enters TQQQ, quantity, buy timestamp **2026-11-02 14:00 America/New_York**, currency/account and fees. The app converts the timezone-aware timestamp to UTC and requests an historical intraday price; the quote is an estimate, **not** proof of the user's broker fill.
2. User confirms or overrides the actual execution price. Store original quote, corrected fill, reason, source, observed timestamp, FX and corporate actions with audit history.
3. The strategy engine schedules review using its published version and trading calendar. For example, a quarterly review from November 2 is around February 2 subject to strategy scheduling rules.
4. A protected scheduler refreshes monitored instruments, checks scheduled strategy reviews and delivers deduplicated in-app/email/Discord alerts.
5. On review, the app values holdings against current quote data, accounts for cash, fees, splits/dividends and strategy-specific targets, then derives proposed buy/sell quantities. User confirms trades; no automatic broker execution.
6. Where user input differs from a provider quote, an audited override triggers recalculation. Both original and corrected values remain distinguishable.

The current repository **does not yet implement this entire journey end-to-end**. The provider HTTP adapter currently supports /quote and /historical; historical trade timestamp validation is in `src/domain/historical-trade-price.ts`. The historical quote ingestion, UI prompt, integration with ledger and adjusted holdings, review alert lifecycle and override reruns require integration tests before customer activation.

## Self-hosted infrastructure

`docker-compose.oracle.yml` defines app, private PostgreSQL and an hourly worker, intended behind a TLS reverse proxy. Securely supply DATABASE_URL, AUTH_SECRET, APP_ENCRYPTION_KEY, CRON_SECRET, live billing/email credentials and a market-data provider endpoint/token. The PostgreSQL port should not be public. Set up independent encrypted off-site backups, recovery drills, uptime monitoring and rate limiting. Run migration and seed under change control before activation.

The HTTP market data service must include **licensed commercial rights appropriate for a paid website**, including any price display or redistribution. Its capabilities need current and historical minute/trade observations, split/dividend handling, historical symbol mapping, FX rates and timestamp metadata. Historical daily close alone is insufficient for a precise intraday entry. Exchange market prices cannot be assumed to match the broker's actual executed price.

The launch preflight demands automatic market data, not manual-entry mode. Exact approval or signoff for UK regulatory perimeter depends on how user-specific actionable trading instructions and marketing are presented; do not treat a disclaimer as a blanket exemption.
