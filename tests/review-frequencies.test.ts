import { describe, expect, it } from "vitest";
import { fixedAllocationEngine } from "../src/domain/strategy/fixed-allocation";

describe("fixed allocation review frequencies", () => {
  const base = { allocations: [{ exposure: "A", weight: "0.5" }, { exposure: "B", weight: "0.5" }], rebalanceThreshold: "0.05" };

  it("accepts every schedule the scheduler supports", () => {
    for (const reviewFrequency of ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "THRESHOLD_ONLY"]) {
      expect(() => fixedAllocationEngine.validateConfig({ ...base, reviewFrequency })).not.toThrow();
    }
  });

  it("rejects unknown values, including inherited object keys", () => {
    for (const reviewFrequency of ["WEEKLY", "toString"]) {
      expect(() => fixedAllocationEngine.validateConfig({ ...base, reviewFrequency })).toThrow("INVALID_FIXED_ALLOCATION_REVIEW_FREQUENCY");
    }
  });
});
