import Decimal from "decimal.js";
import type { TrustedHistoricalSeries } from "./strategy/types";

export type HistoryRow = { tradingDay: string; adjustedClose: string; currency: string; provider: string; licensed: boolean };

export type HistoryRules = {
  now: Date;
  currency: string;
  /** Series must reach back at least this many days from `now`. */
  minSpanDays: number;
  /** The newest point may be at most this old. */
  maxAgeDays: number;
  /** No gap between consecutive points may exceed this many days (weekends and holidays fit in 5). */
  maxGapDays?: number;
};

const DAY = 86_400_000;
const at = (day: string) => new Date(day + "T00:00:00.000Z");

/**
 * Turns stored rows into a series an engine may trust, or null. It fails closed: any unlicensed row,
 * mixed provider or currency, non-positive price, duplicate day, stale tail, short span or large gap
 * rejects the whole series, so a signal is never computed from partial or untrusted data.
 */
export function buildTrustedSeries(exposure: string, rows: readonly HistoryRow[], rules: HistoryRules): TrustedHistoricalSeries | null {
  if (!rows.length) return null;
  const providers = new Set(rows.map((row) => row.provider));
  if (providers.size !== 1) return null;
  if (rows.some((row) => !row.licensed || row.currency.toUpperCase() !== rules.currency.toUpperCase() || !/^\d{4}-\d{2}-\d{2}$/.test(row.tradingDay))) return null;
  const sorted = [...rows].sort((a, b) => a.tradingDay.localeCompare(b.tradingDay));
  const points = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i].tradingDay === sorted[i - 1].tradingDay) return null;
    let price: Decimal;
    try { price = new Decimal(sorted[i].adjustedClose); } catch { return null; }
    if (!price.isFinite() || price.lte(0)) return null;
    points.push({ at: at(sorted[i].tradingDay), adjustedClose: price });
  }
  const first = points[0].at.getTime();
  const last = points[points.length - 1].at.getTime();
  if (rules.now.getTime() - last > rules.maxAgeDays * DAY) return null;
  if (rules.now.getTime() - first < rules.minSpanDays * DAY) return null;
  const maxGap = (rules.maxGapDays ?? 5) * DAY;
  for (let i = 1; i < points.length; i += 1) if (points[i].at.getTime() - points[i - 1].at.getTime() > maxGap) return null;
  return { exposure, currency: rules.currency.toUpperCase(), points, source: [...providers][0] };
}

export type HistoryObservation = { price: string; currency: string; observedAt: Date; granularity?: string; priceKind?: string };

/**
 * Whether a provider answer may be stored as that day's adjusted close. It must be a daily-bar CLOSE
 * dated exactly that day, in the line's currency, with a positive price. Anything else (an intraday
 * quote, the previous session returned for a holiday, a different currency) is rejected, never guessed.
 */
export function acceptHistoryObservation(observation: HistoryObservation | null, day: string, currency: string) {
  if (!observation) return false;
  if (observation.priceKind !== "CLOSE" || observation.granularity !== "DAILY_BAR") return false;
  if (observation.currency.toUpperCase() !== currency.toUpperCase()) return false;
  if (observation.observedAt.toISOString().slice(0, 10) !== day) return false;
  try { return new Decimal(observation.price).gt(0); } catch { return false; }
}
