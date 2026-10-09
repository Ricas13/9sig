import { describe, expect, it } from "vitest";
import { buildTrustedSeries, type HistoryRow } from "../src/domain/trusted-history";

const NOW = new Date("2026-10-09T12:00:00Z");
const rules = { now: NOW, currency: "GBP", minSpanDays: 20, maxAgeDays: 4 };
const row = (tradingDay: string, over: Partial<HistoryRow> = {}): HistoryRow => ({ tradingDay, adjustedClose: "100", currency: "GBP", provider: "p", licensed: true, ...over });
// Business days 2026-09-14 .. 2026-10-08, covering 25 days.
const days = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];

describe("trusted history", () => {
  it("accepts a licensed, fresh, gap-free series and orders it by day", () => {
    const series = buildTrustedSeries("GOLD", [...days].reverse().map((d) => row(d)), rules);
    expect(series?.points).toHaveLength(days.length);
    expect(series?.points[0].at.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(series?.source).toBe("p");
  });
  it("rejects any unlicensed row", () => {
    expect(buildTrustedSeries("GOLD", days.map((d, i) => row(d, { licensed: i !== 3 })), rules)).toBeNull();
  });
  it("rejects mixed providers and mixed currencies", () => {
    expect(buildTrustedSeries("GOLD", days.map((d, i) => row(d, { provider: i === 2 ? "q" : "p" })), rules)).toBeNull();
    expect(buildTrustedSeries("GOLD", days.map((d, i) => row(d, { currency: i === 2 ? "USD" : "GBP" })), rules)).toBeNull();
  });
  it("rejects a stale tail, a short span and a large gap", () => {
    expect(buildTrustedSeries("GOLD", days.slice(0, -4).map((d) => row(d)), rules)).toBeNull();
    expect(buildTrustedSeries("GOLD", days.slice(-6).map((d) => row(d)), rules)).toBeNull();
    expect(buildTrustedSeries("GOLD", days.filter((d) => !["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"].includes(d)).map((d) => row(d)), rules)).toBeNull();
  });
  it("rejects duplicate days, non-positive and non-numeric prices, and empty input", () => {
    expect(buildTrustedSeries("GOLD", [...days.map((d) => row(d)), row("2026-10-08")], rules)).toBeNull();
    expect(buildTrustedSeries("GOLD", days.map((d, i) => row(d, { adjustedClose: i === 4 ? "0" : "100" })), rules)).toBeNull();
    expect(buildTrustedSeries("GOLD", days.map((d, i) => row(d, { adjustedClose: i === 4 ? "abc" : "100" })), rules)).toBeNull();
    expect(buildTrustedSeries("GOLD", [], rules)).toBeNull();
  });
});
