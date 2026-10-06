import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";

export type PriceObservation = {
  price: string;
  currency: string;
  observedAt: Date;
  provider: string;
};

export interface MarketDataProvider {
  name: string;
  configured: boolean;
  currentPrice(providerSymbol: string): Promise<PriceObservation | null>;
  historicalPrice(providerSymbol: string, at: Date): Promise<PriceObservation | null>;
}

const quoteSchema = z.object({
  price: z.union([z.string(), z.number()]),
  currency: z.string().length(3),
  observedAt: z.string().datetime({ offset: true })
});

function validatedObservation(raw: unknown, provider: string): PriceObservation {
  const parsed = quoteSchema.parse(raw);
  const price = new Decimal(String(parsed.price));
  if (!price.isFinite() || price.lte(0)) throw new Error("MARKET_DATA_INVALID_PRICE");
  const observedAt = new Date(parsed.observedAt);
  if (observedAt.getTime() > Date.now() + 5 * 60 * 1000) throw new Error("MARKET_DATA_FUTURE_TIMESTAMP");
  return {
    price: price.toString(),
    currency: parsed.currency.toUpperCase(),
    observedAt,
    provider
  };
}

class UnconfiguredMarketDataProvider implements MarketDataProvider {
  name = "unconfigured";
  configured = false;
  async currentPrice() { return null; }
  async historicalPrice() { return null; }
}

export class MockMarketDataProvider implements MarketDataProvider {
  name = "mock";
  configured = true;
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

class HttpMarketDataProvider implements MarketDataProvider {
  name = "http";
  configured: boolean;

  constructor(private baseUrl: string | undefined, private token: string | undefined) {
    this.configured = Boolean(baseUrl && token);
  }

  private async fetchQuote(path: string, params: Record<string, string>) {
    if (!this.configured || !this.baseUrl || !this.token) return null;
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new Error("MARKET_DATA_HTTPS_REQUIRED");
    }

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: "Bearer " + this.token
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("MARKET_DATA_HTTP_" + response.status);
    return validatedObservation(await response.json(), this.name);
  }

  async currentPrice(providerSymbol: string) {
    return this.fetchQuote("/quote", { symbol: providerSymbol });
  }

  async historicalPrice(providerSymbol: string, at: Date) {
    return this.fetchQuote("/historical", { symbol: providerSymbol, at: at.toISOString() });
  }
}

export function getMarketDataProvider(): MarketDataProvider {
  if (process.env.NODE_ENV !== "production" && process.env.MARKET_DATA_PROVIDER === "mock") {
    return new MockMarketDataProvider();
  }
  if (process.env.MARKET_DATA_PROVIDER === "http") {
    return new HttpMarketDataProvider(process.env.MARKET_DATA_HTTP_BASE_URL, process.env.MARKET_DATA_HTTP_TOKEN);
  }
  return new UnconfiguredMarketDataProvider();
}

export function classifyFreshness(observedAt: Date, now = new Date(), maxAgeHours = 36) {
  const hours = (now.getTime() - observedAt.getTime()) / 3_600_000;
  return hours <= maxAgeHours ? "CURRENT" : "STALE";
}
