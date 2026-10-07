import { describe, expect, it } from "vitest";
import { plainEnglishActionReason } from "../src/domain/action-copy";

describe("plain-English action copy", () => {
  it("explains buys without exposing calculation jargon", () => {
    expect(plainEnglishActionReason({actionType:"BUY"})).toBe(
      "Your strategy wants more of this exposure. This order moves you closer to its target."
    );
  });

  it("explains holds as no action required", () => {
    expect(plainEnglishActionReason({actionType:"HOLD"})).toContain("no trade is needed");
  });

  it("makes safety blocks explicit", () => {
    expect(plainEnglishActionReason({actionType:"DATA_REQUIRED"})).toContain("rather than guessing");
  });

  it("has a safe fallback for future action types", () => {
    expect(plainEnglishActionReason({actionType:"FUTURE_ACTION",instruction:"Do something."})).toContain("next step");
  });
});
