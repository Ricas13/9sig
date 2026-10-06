import { describe, expect, it } from "vitest";
import { validateExecution } from "../src/domain/execution";

describe("trade execution validation", () => {
  it("records actual buy notional and fee", () => {
    const result = validateExecution({
      side: "BUY",
      proposedAmount: "1000",
      price: "99",
      quantity: "10.1",
      fee: "2",
      availableCash: "1200",
      heldQuantity: "0"
    });
    expect(result.grossNotional.toFixed(2)).toBe("999.90");
    expect(result.cashAmount.toFixed(2)).toBe("-999.90");
    expect(result.fee.toFixed(2)).toBe("2.00");
  });

  it("rejects a buy that would overdraw cash including fees", () => {
    expect(() => validateExecution({
      side: "BUY",
      proposedAmount: "1000",
      price: "100",
      quantity: "10",
      fee: "5",
      availableCash: "1000",
      heldQuantity: "0"
    })).toThrow("INSUFFICIENT_CASH");
  });

  it("rejects a sell larger than the holding", () => {
    expect(() => validateExecution({
      side: "SELL",
      proposedAmount: "500",
      price: "100",
      quantity: "5",
      availableCash: "0",
      heldQuantity: "4.9"
    })).toThrow("INSUFFICIENT_HOLDINGS");
  });

  it("rejects an execution materially different from the calculated action", () => {
    expect(() => validateExecution({
      side: "BUY",
      proposedAmount: "1000",
      price: "100",
      quantity: "8",
      availableCash: "2000",
      heldQuantity: "0"
    })).toThrow("EXECUTION_NOTIONAL_MISMATCH");
  });
});
