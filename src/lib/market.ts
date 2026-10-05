import "server-only";

export type PricePoint = { date: string; price: number };
export type Quote = { symbol: string; price: number; asOf: string; currency: string };

function yahooUrl(symbol: string, start?: string, end?: string) {
  const params = new URLSearchParams({ interval: "1d", events: "history", includeAdjustedClose: "true" });
  if (start) params.set("period1", String(Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000)));
  if (end) params.set("period2", String(Math.floor((new Date(`${end}T00:00:00Z`).getTime() + 86_400_000) / 1000)));
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
}

function normalize(price: number, currency: string) {
  const raw = currency.trim();
  const c = raw.toUpperCase();
  if (raw === "GBp" || c === "GBX" || c === "GBPENCE") return price / 100;
  if (c === "GBP") return price;
  return price;
}

async function rawSeries(symbol: string, start?: string, end?: string) {
  const response = await fetch(yahooUrl(symbol, start, end), {
    next: { revalidate: 900 },
    headers: { "User-Agent": "Mozilla/5.0 9Sig/1.0" },
  });
  if (!response.ok) throw new Error(`Market data unavailable for ${symbol}`);
  const body = await response.json();
  const result = body?.chart?.result?.[0];
  if (!result) throw new Error(`No market data returned for ${symbol}`);
  return result;
}

export async function getHistory(symbol: string, start: string, end: string): Promise<PricePoint[]> {
  const result = await rawSeries(symbol, start, end);
  const currency = result.meta?.currency ?? "";
  const timestamps: number[] = result.timestamp ?? [];
  const adjusted: Array<number | null> = result.indicators?.adjclose?.[0]?.adjclose ?? result.indicators?.quote?.[0]?.close ?? [];
  return timestamps.flatMap((ts, i) => {
    const value = adjusted[i];
    if (value == null || !Number.isFinite(value)) return [];
    return [{ date: new Date(ts * 1000).toISOString().slice(0, 10), price: normalize(Number(value), currency) }];
  });
}

export async function getQuote(symbol: string): Promise<Quote> {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const points = await getHistory(symbol, start, end.toISOString().slice(0, 10));
  const last = points.at(-1);
  if (!last) throw new Error(`No recent quote for ${symbol}`);
  const result = await rawSeries(symbol, start, end.toISOString().slice(0, 10));
  return { symbol, price: last.price, asOf: last.date, currency: result.meta?.currency ?? "" };
}

export async function getQuoteSafe(symbol: string) {
  try { return await getQuote(symbol); } catch { return null; }
}

export function priceOnOrBefore(points: PricePoint[], date: string) {
  let value: PricePoint | null = null;
  for (const point of points) {
    if (point.date > date) break;
    value = point;
  }
  return value;
}