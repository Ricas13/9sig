import "server-only";

export type PriceObservation = {
  price: string;
  currency: string;
  observedAt: Date;
  provider: string;
};

export interface MarketDataProvider {
  name: string;
  currentPrice(providerSymbol: string): Promise<PriceObservation | null>;
  historicalPrice(providerSymbol: string, at: Date): Promise<PriceObservation | null>;
}

class UnconfiguredMarketDataProvider implements MarketDataProvider {
  name = "unconfigured";
  async currentPrice() { return null; }
  async historicalPrice() { return null; }
}

export class MockMarketDataProvider implements MarketDataProvider {
  name = "mock";
  constructor(private prices: Record<string, string> = {}) {}
  async currentPrice(providerSymbol: string) {
    const price = this.prices[providerSymbol];
    return price ? { price, currency: "GBP", observedAt: new Date(), provider: this.name } : null;
  }
  async historicalPrice(providerSymbol: string, at: Date) {
    const price = this.prices[providerSymbol];
    return price ? { price, currency: "GBP", observedAt: at, provider: this.name } : null;
  }
}

export function getMarketDataProvider(): MarketDataProvider {
  if (process.env.NODE_ENV !== "production" && process.env.MARKET_DATA_PROVIDER === "mock") return new MockMarketDataProvider();
  return new UnconfiguredMarketDataProvider();
}

export function classifyFreshness(observedAt: Date, now = new Date(), maxAgeHours = 36) {
  const hours = (now.getTime() - observedAt.getTime()) / 3600000;
  return hours <= maxAgeHours ? "CURRENT" : "STALE";
}
