# Performance methodology

Three concepts are kept separate:

- MODEL: canonical theoretical strategy implementation
- USER time-weighted performance: implementation performance with cash-flow distortion removed
- USER money-weighted return / XIRR: the investor's realised timing experience

performance_series stores series independently by type. Deposits are source ledger events and are not counted as investment gain.

Reference tests cover cash-flow-neutral time-weighted return and XIRR.
