import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { planRebalance } from "../src/domain/strategy/rebalance-plan";
import { EXPOSURES, assertRegisteredExposures, getExposure } from "../src/domain/strategy/exposures";
import { RESEARCH_STRATEGIES } from "../src/domain/strategy/research-catalog";

const d = (v: string | number) => new Decimal(v);
const plan = (rows: Array<[string, number, string]>, cash: number, threshold = "0") =>
  planRebalance({ rows: rows.map(([exposure, current, weight]) => ({ exposure, current: d(current), weight: d(weight) })), cash: d(cash), threshold: d(threshold) })
    .map((leg) => leg.side + " " + leg.exposure + " " + leg.amount.toFixed(2));

// Expected values below were worked out by hand: target = weight × (invested + cash).
describe("ordered rebalance legs (golden)", () => {
  it("two assets, equity heavy: 7000/3000 at 60/40 → sell 1000 A, buy 1000 B", () => {
    expect(plan([["A", 7000, "0.6"], ["B", 3000, "0.4"]], 0)).toEqual(["SELL A 1000.00", "BUY B 1000.00"]);
  });
  it("three assets: 6000/2500/1500 at 50/30/20 → sell 1000 A, buy 500 B, buy 500 C", () => {
    expect(plan([["A", 6000, "0.5"], ["B", 2500, "0.3"], ["C", 1500, "0.2"]], 0)).toEqual(["SELL A 1000.00", "BUY B 500.00", "BUY C 500.00"]);
  });
  it("a deposit alone funds the buys, with no sale: 5000/5000 + 2000 cash at 50/50", () => {
    expect(plan([["A", 5000, "0.5"], ["B", 5000, "0.5"]], 2000)).toEqual(["BUY A 1000.00", "BUY B 1000.00"]);
  });
  it("sells always come before buys (total 10000, targets 2500/5000/2500: sell C 3500, buy B 2000, buy A 1500)", () => {
    const sides = planRebalance({ rows: [{ exposure: "A", current: d(1000), weight: d("0.25") }, { exposure: "B", current: d(3000), weight: d("0.5") }, { exposure: "C", current: d(6000), weight: d("0.25") }], cash: d(0), threshold: d(0) }).map((l) => l.side);
    expect(sides).toEqual(["SELL", "BUY", "BUY"]);
  });
  it("uneven weights: all in A at 33.33/33.33/33.34 → sell 6667, buy 3334 then 3333", () => {
    expect(plan([["A", 10000, "0.3333"], ["B", 0, "0.3333"], ["C", 0, "0.3334"]], 0)).toEqual(["SELL A 6667.00", "BUY C 3334.00", "BUY B 3333.00"]);
  });
  it("rounding residue lands on the last purchase so cash is spent exactly", () => {
    // total 100.01, equal thirds: each target 33.336666… → cents 33.34 each, sells 0, buys 3 × 33.34 = 100.02 vs 100.01 cash
    const legs = planRebalance({ rows: ["A", "B", "C"].map((e, i) => ({ exposure: e, current: d(0), weight: d(i < 2 ? "0.3333" : "0.3334") })), cash: d("100.01"), threshold: d(0) });
    const bought = legs.reduce((sum, leg) => sum.plus(leg.amount), d(0));
    expect(bought.toFixed(2)).toBe("100.01");
  });
  it("does nothing inside the threshold: 5200/4800 at 50/50, 5% band", () => {
    expect(plan([["A", 5200, "0.5"], ["B", 4800, "0.5"]], 0, "0.05")).toEqual([]);
  });
  it("acts just outside the threshold: 5600/4400 at 50/50, 5% band → sell 600, buy 600", () => {
    expect(plan([["A", 5600, "0.5"], ["B", 4400, "0.5"]], 0, "0.05")).toEqual(["SELL A 600.00", "BUY B 600.00"]);
  });
  it("empty portfolio gives no legs", () => {
    expect(plan([["A", 0, "0.5"], ["B", 0, "0.5"]], 0)).toEqual([]);
  });
});

describe("exposure registry", () => {
  it("has unique ids and valid shapes", () => {
    expect(new Set(EXPOSURES.map((e) => e.id)).size).toBe(EXPOSURES.length);
    expect(getExposure("US_EQUITY_3X_LONG")?.leverage).toBe(3);
    expect(getExposure("BROAD_EQUITY")?.leverage).toBe(1);
  });
  it("covers every exposure the catalogue's fixed strategies use", () => {
    for (const strategy of RESEARCH_STRATEGIES) {
      const allocations = (strategy.config as { allocations?: Array<{ exposure: string }> } | undefined)?.allocations;
      if (!allocations) continue;
      expect(() => assertRegisteredExposures(allocations.map((a) => a.exposure))).not.toThrow();
    }
  });
  it("rejects unknown exposures", () => {
    expect(() => assertRegisteredExposures(["VOO"])).toThrow("UNREGISTERED_EXPOSURE:VOO");
  });
});
