# Performance methodology

The application keeps four concepts separate:

- USER_VALUE: the user's actual tracked account value from ledger positions plus current validated market data
- Canonical model index: versioned model history loaded for a specific StrategyVersion
- Benchmark index: benchmark history paired with that canonical model history
- Money-weighted return / XIRR: the investor's realised timing experience using their dated external cash flows

## Same-cash-flow chart comparison

The strategy chart does not compare a DCA account balance with a buy-and-hold index naively. The user's first tracked value anchors the model and benchmark. Every later CONTRIBUTION and WITHDRAWAL is applied to the model and benchmark at the next available index point. This produces a counterfactual account value under the same external cash-flow schedule.

That means deposits increase all comparison series rather than appearing as investment return.

Quick Resume does not invent historical deposits. A resumed strategy therefore starts comparisons from its first trustworthy tracked value and only applies cash flows recorded after that anchor.

## Return metrics

The community aggregate worker computes per-instance XIRR from dated contributions/withdrawals plus the latest terminal account value, then publishes the median only when the privacy threshold is met. It does not average user-level returns naively.

A conventional daily time-weighted-return series should only be published when valuation frequency and flow timing are sufficient to support the method. The current product does not label sparse account-value points as TWR.
