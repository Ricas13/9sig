import { describe,expect,it } from "vitest";
import { foldLedger,assertLedgerEvent } from "../src/domain/ledger";

describe("immutable ledger fold",()=>{
  it("keeps a contribution as cash until a buy exists",()=>{
    const state=foldLedger([{eventType:"CONTRIBUTION",cashAmount:"1000"}]);
    expect(state.cash.toFixed(2)).toBe("1000.00");
    expect(state.quantities.size).toBe(0);
  });
  it("folds buys, fees and sells without rewriting prior events",()=>{
    const state=foldLedger([
      {eventType:"CONTRIBUTION",cashAmount:"1000"},
      {eventType:"BUY",cashAmount:"-600",feeAmount:"2",instrumentId:"asset",quantity:"3"},
      {eventType:"SELL",cashAmount:"220",feeAmount:"1",instrumentId:"asset",quantity:"-1"}
    ]);
    expect(state.cash.toFixed(2)).toBe("617.00");
    expect(state.quantities.get("asset")?.toFixed(2)).toBe("2.00");
  });
  it("never adds different currencies together",()=>{
    const state=foldLedger([
      {eventType:"CONTRIBUTION",currency:"GBP",cashAmount:"100"},
      {eventType:"CONTRIBUTION",currency:"USD",cashAmount:"100"}
    ],"GBP");
    expect(state.cash.toFixed(2)).toBe("100.00");
    expect(state.cashByCurrency.get("USD")?.toFixed(2)).toBe("100.00");
  });
  it("requires a base currency when a multi-currency ledger is folded generically",()=>{
    expect(()=>foldLedger([
      {eventType:"CONTRIBUTION",currency:"GBP",cashAmount:"100"},
      {eventType:"CONTRIBUTION",currency:"USD",cashAmount:"100"}
    ])).toThrow("BASE_CURRENCY_REQUIRED_FOR_MULTI_CURRENCY_LEDGER");
  });
  it("rejects sign-inconsistent trade events",()=>{
    expect(()=>assertLedgerEvent({eventType:"BUY",cashAmount:"100",instrumentId:"x",quantity:"1"})).toThrow();
  });
  it("rejects negative fees on normal ledger rows",()=>{
    expect(()=>assertLedgerEvent({eventType:"BUY",cashAmount:"-100",feeAmount:"-1",instrumentId:"x",quantity:"1"})).toThrow("Ledger fees cannot be negative");
  });
  it("rejects trade fees smuggled onto non-trade cash events",()=>{
    expect(()=>assertLedgerEvent({eventType:"CONTRIBUTION",cashAmount:"100",feeAmount:"2"})).toThrow("Only trade, fee, or correction events may carry a fee amount");
  });
  it("allows a correction row to reverse an earlier fee",()=>{
    expect(()=>assertLedgerEvent({eventType:"CORRECTION",cashAmount:"100",feeAmount:"-2",instrumentId:"x",quantity:"-1"})).not.toThrow();
  });
  it("requires fee-only events to use a positive fee amount",()=>{
    expect(()=>assertLedgerEvent({eventType:"FEE",cashAmount:"0",feeAmount:"2"})).not.toThrow();
    expect(()=>assertLedgerEvent({eventType:"FEE",cashAmount:"-2",feeAmount:"2"})).toThrow();
  });
});
