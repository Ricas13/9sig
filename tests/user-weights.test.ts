import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { effectiveAllocations, fixedAllocationEngine } from "../src/domain/strategy/fixed-allocation";

const config = { allocations: [{ exposure: "DOMESTIC_EQUITY", weight: "0.40" }, { exposure: "INTERNATIONAL_EQUITY", weight: "0.40" }, { exposure: "AGGREGATE_BONDS", weight: "0.20" }], reviewFrequency: "ANNUAL", rebalanceThreshold: "0.05", userWeights: true };
const ctx = (settings: Record<string, unknown>, overrides = {}) => ({
  strategyInstanceId: "i", strategyVersionId: "v", now: new Date("2026-10-09T12:00:00Z"), baseCurrency: "GBP", cash: new Decimal(0),
  exposures: [
    { economicExposure: "DOMESTIC_EQUITY", value: new Decimal(5000) },
    { economicExposure: "INTERNATIONAL_EQUITY", value: new Decimal(3000) },
    { economicExposure: "AGGREGATE_BONDS", value: new Decimal(2000) }
  ],
  contributionsSinceReview: new Decimal(0), state: {}, config, settings, reviewDue: true, dataHealth: { status: "CURRENT" as const }, ...overrides
});

describe("investor-chosen weights", () => {
  it("falls back to the configured weights when the investor sets none", () => {
    expect(effectiveAllocations(config, {})?.map((a) => a.weight)).toEqual(["0.4", "0.4", "0.2"].map((w) => new Decimal(w).toString()).map(String));
  });
  it("applies chosen weights that total 100%", () => {
    const rows = effectiveAllocations(config, { weight_DOMESTIC_EQUITY: "0.3", weight_INTERNATIONAL_EQUITY: "0.5" });
    expect(rows?.map((a) => a.weight)).toEqual(["0.3", "0.5", "0.2"]);
  });
  it("rejects weights that do not total 100% or are not positive", () => {
    expect(effectiveAllocations(config, { weight_DOMESTIC_EQUITY: "0.5" })).toBeNull();
    expect(effectiveAllocations(config, { weight_DOMESTIC_EQUITY: "0", weight_INTERNATIONAL_EQUITY: "0.8" })).toBeNull();
    expect(effectiveAllocations(config, { weight_DOMESTIC_EQUITY: "abc" })).toBeNull();
  });
  it("ignores settings entirely unless the version opts in", () => {
    expect(effectiveAllocations({ ...config, userWeights: false }, { weight_DOMESTIC_EQUITY: "0.9" })?.[0].weight).toBe("0.40");
  });
  it("engine asks for data rather than trading on invalid weights", () => {
    const result = fixedAllocationEngine.calculate(ctx({ weight_DOMESTIC_EQUITY: "0.9" }));
    expect(result.actionType).toBe("DATA_REQUIRED");
  });
  it("engine holds when holdings already match the chosen 50/30/20 weights", () => {
    const result = fixedAllocationEngine.calculate(ctx({ weight_DOMESTIC_EQUITY: "0.5", weight_INTERNATIONAL_EQUITY: "0.3" }));
    expect(result.actionType).toBe("HOLD");
  });
  it("engine sells the overweight sleeve when the chosen weights move away from holdings", () => {
    const result = fixedAllocationEngine.calculate(ctx({ weight_DOMESTIC_EQUITY: "0.3", weight_INTERNATIONAL_EQUITY: "0.5" }, {}));
    // targets 3000/5000/2000 on 10000: domestic is 2000 over, international 2000 under
    expect(result.actionType).toBe("SELL");
    expect(result.economicExposure).toBe("DOMESTIC_EQUITY");
    expect(result.amount?.toFixed(2)).toBe("2000.00");
  });
  it("rejects a non-boolean userWeights flag", () => {
    expect(() => fixedAllocationEngine.validateConfig({ ...config, userWeights: "yes" })).toThrow("INVALID_FIXED_ALLOCATION_USER_WEIGHTS");
  });
});

describe("full plan shown with the next step", () => {
  it("lists every leg, sales before purchases, while proposing only the first", () => {
    // 10000 held as 6000/2500/1500 against 50/30/20 targets: sell 1000 domestic, buy 500 + 500.
    const result = fixedAllocationEngine.calculate(ctx({ weight_DOMESTIC_EQUITY: "0.5", weight_INTERNATIONAL_EQUITY: "0.3" }, {
      exposures: [
        { economicExposure: "DOMESTIC_EQUITY", value: new Decimal(6000) },
        { economicExposure: "INTERNATIONAL_EQUITY", value: new Decimal(2500) },
        { economicExposure: "AGGREGATE_BONDS", value: new Decimal(1500) }
      ]
    }));
    expect(result.actionType).toBe("SELL");
    expect(result.amount?.toFixed(2)).toBe("1000.00");
    const plan = result.explanation.filter((row) => row.label.startsWith("Full plan")).map((row) => row.value);
    expect(plan).toEqual(["Sell 1000.00 GBP of DOMESTIC_EQUITY", "Buy 500.00 GBP of INTERNATIONAL_EQUITY", "Buy 500.00 GBP of AGGREGATE_BONDS"]);
  });
});
