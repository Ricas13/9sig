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
  it("rejects sign-inconsistent trade events",()=>{
    expect(()=>assertLedgerEvent({eventType:"BUY",cashAmount:"100",instrumentId:"x",quantity:"1"})).toThrow();
  });
});
