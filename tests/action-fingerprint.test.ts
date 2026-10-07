import { describe,expect,it } from "vitest";
import { actionFingerprintMaterial } from "../src/domain/action-fingerprint";

const base={
  strategyInstanceId:"strategy-1",
  strategyVersionId:"version-1",
  lastReviewIso:"2026-10-01T00:00:00.000Z",
  actionType:"BUY",
  currency:"GBP",
  economicExposure:"NASDAQ_100_3X",
  leverage:"3",
  tradingLineId:"line-1",
  executionAccountId:"account-1",
  effectiveCash:"1000",
  contributionsSinceReview:"500",
  stableHoldings:"account-1:instrument-1:12",
  dataStatus:"CURRENT"
};

describe("action fingerprint material",()=>{
  it("stays stable when only presentation or quote-derived order details change",()=>{
    const first=actionFingerprintMaterial(base);
    const second=actionFingerprintMaterial({...base});
    expect(second).toBe(first);
  });

  it("changes when ledger/account/review identity changes",()=>{
    const first=actionFingerprintMaterial(base);
    expect(actionFingerprintMaterial({...base,effectiveCash:"1200"})).not.toBe(first);
    expect(actionFingerprintMaterial({...base,stableHoldings:"account-1:instrument-1:13"})).not.toBe(first);
    expect(actionFingerprintMaterial({...base,executionAccountId:"account-2"})).not.toBe(first);
    expect(actionFingerprintMaterial({...base,lastReviewIso:"2026-10-02T00:00:00.000Z"})).not.toBe(first);
  });

  it("changes when the logical action changes",()=>{
    const first=actionFingerprintMaterial(base);
    expect(actionFingerprintMaterial({...base,actionType:"SELL"})).not.toBe(first);
    expect(actionFingerprintMaterial({...base,tradingLineId:"line-2"})).not.toBe(first);
    expect(actionFingerprintMaterial({...base,dataStatus:"MISSING"})).not.toBe(first);
  });
});
