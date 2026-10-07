import { describe, expect, it } from "vitest";
import { assertExecutionCurrencyMatch, planPracticalTrade, validateExecution } from "../src/domain/execution";

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

  it("rounds a small whole-share account down to an executable order", () => {
    const result = planPracticalTrade({
      side:"BUY",
      proposedAmount:"500",
      price:"72",
      availableCash:"500",
      heldQuantity:"0",
      constraints:{fractionalShares:false}
    });
    expect(result.status).toBe("EXECUTABLE");
    if(result.status!=="EXECUTABLE")return;
    expect(result.quantity.toString()).toBe("6");
    expect(result.amount.toFixed(2)).toBe("432.00");
    expect(result.constrained).toBe(true);
  });

  it("preserves a cash buffer and estimated fee when planning a buy", () => {
    const result = planPracticalTrade({
      side:"BUY",
      proposedAmount:"1000",
      price:"10",
      availableCash:"1000",
      heldQuantity:"0",
      constraints:{cashBufferAmount:"100",flatFee:"5"}
    });
    expect(result.status).toBe("EXECUTABLE");
    if(result.status!=="EXECUTABLE")return;
    expect(result.amount.toFixed(2)).toBe("895.00");
    expect(result.estimatedFee.toFixed(2)).toBe("5.00");
  });

  it("blocks trades below the customer minimum", () => {
    const result = planPracticalTrade({
      side:"BUY",
      proposedAmount:"40",
      price:"10",
      availableCash:"500",
      heldQuantity:"0",
      constraints:{minimumTradeAmount:"50"}
    });
    expect(result).toMatchObject({status:"BLOCKED",reason:"BELOW_MINIMUM_TRADE"});
  });

  it("blocks a sell when sell recommendations are disabled", () => {
    const result = planPracticalTrade({
      side:"SELL",
      proposedAmount:"500",
      price:"100",
      availableCash:"0",
      heldQuantity:"10",
      constraints:{allowSelling:false}
    });
    expect(result).toMatchObject({status:"BLOCKED",reason:"SELLING_DISABLED"});
  });

  it("blocks a whole-share trade that cannot buy one unit", () => {
    const result = planPracticalTrade({
      side:"BUY",
      proposedAmount:"50",
      price:"75",
      availableCash:"50",
      heldQuantity:"0",
      constraints:{fractionalShares:false}
    });
    expect(result).toMatchObject({status:"BLOCKED",reason:"BELOW_ONE_SHARE"});
  });


  it("accepts an explicitly partial fill below the proposed notional", () => {
    const result = validateExecution({
      side:"BUY",
      proposedAmount:"1000",
      price:"100",
      quantity:"4",
      availableCash:"1500",
      heldQuantity:"0",
      allowPartial:true
    });
    expect(result.grossNotional.toFixed(2)).toBe("400.00");
  });

  it("still rejects an oversized fill when marked partial", () => {
    expect(() => validateExecution({
      side:"BUY",
      proposedAmount:"1000",
      price:"100",
      quantity:"11",
      availableCash:"2000",
      heldQuantity:"0",
      allowPartial:true
    })).toThrow("EXECUTION_NOTIONAL_MISMATCH");
  });

});


describe("execution currency invariant", () => {
  it("accepts the same currency and returns a canonical code", () => {
    expect(assertExecutionCurrencyMatch("gbp", "GBP")).toBe("GBP");
  });

  it("rejects a currency mismatch", () => {
    expect(() => assertExecutionCurrencyMatch("USD", "GBP")).toThrow("EXECUTION_CURRENCY_MISMATCH");
  });

  it("fails closed when either currency is missing", () => {
    expect(() => assertExecutionCurrencyMatch(null, "GBP")).toThrow("EXECUTION_CURRENCY_MISMATCH");
    expect(() => assertExecutionCurrencyMatch("GBP", undefined)).toThrow("EXECUTION_CURRENCY_MISMATCH");
  });
});
