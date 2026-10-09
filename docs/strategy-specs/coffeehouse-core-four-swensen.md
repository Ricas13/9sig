# Three additional US reference portfolio drafts

These are **code-defined research versions** only. Seeding installs disabled draft versions; no market mappings, verified execution advice, source-rights sign-off or UK ISA substitutions are implied. The platform's market resolver requires each distinct sleeve to have an exact economic-exposure, leverage, country/wrapper and broker match.

## Coffeehouse — US seven-fund reference

- 10% US large-cap blend
- 10% US large-cap value
- 10% US small-cap blend
- 10% US small-cap value
- 10% developed ex-US large cap
- 40% US intermediate Treasuries
- 10% US REITs

Reference: https://portfoliocharts.com/portfolios/coffeehouse-portfolio/ (Bill Schultheis model). Platform convention: annual calendar review; other schedules require reviewed versions.

## Rick Ferri Classic Core Four — Portfolio Charts reference

- 48% US large cap
- 24% developed ex-US large cap
- 20% US intermediate Treasuries
- 8% US REITs

Reference: https://portfoliocharts.com/portfolios/core-four-portfolio/. Several Core Four variants use different fixed-income funds; notably a US aggregate bond fund is **not** assumed interchangeable with intermediate Treasuries.

## Swensen six-asset individual-investor reference

- 30% US total equity
- 15% developed ex-US
- 5% emerging market equity
- 20% US REITs
- 15% US intermediate Treasuries
- 15% US inflation-protected Treasuries (TIPS)

Reference: https://www.bogleheads.org/blog/2021/01/02/david-swensens-portfolio-from-unconventional-success-2020-update/. Do not describe this as Yale endowment's asset allocation. The Treasury maturity convention is provisional until separately source-verified.

## Release blockers

The amounts in `tests/strategy-reference-golden.test.ts` are independently worked arithmetic examples for the **chosen platform reference splits**, NOT independent author-endorsed strategy backtests. Before publication, verify the exact historical methodology, identify broker-eligible real securities for each sleeve, settle currency and calendar conventions, check source rights, attest the reviewed version and pass real full-journey staging tests. Do not populate mappings with superficially similar ETFs just to enable a portfolio.
