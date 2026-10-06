# Regional instrument resolver

Strategies describe economic exposure, leverage and direction. They do not contain tickers.

Instrument is the stable security-level entity. TradingLine represents a dated exchange / ticker / currency listing. RegionalInstrumentMapping connects an economic exposure to a faithful trading line for a country, wrapper and optional broker.

Mappings have effective dates and a fidelity field. The resolver accepts only EXACT mappings for financial actions. If no faithful implementation is configured, the application reports that the strategy is unsupported for that account instead of silently substituting another exposure.

Production instrument mappings are intentionally not guessed by seed data.
