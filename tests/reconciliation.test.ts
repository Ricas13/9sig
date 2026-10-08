import { describe,expect,it } from "vitest";
import { summarizeReconciliationState } from "../src/domain/reconciliation";

describe("linked-account reconciliation state",()=>{
  it("keeps the strategy blocked when another account is unresolved",()=>{
    const result=summarizeReconciliationState([
      {accountId:"a",difference:"0",reason:null,resolved:true},
      {accountId:"b",difference:"12.50",reason:"Unknown adjustment",resolved:false}
    ],false);
    expect(result.strategyResolved).toBe(false);
    expect(result.state?.accounts).toEqual([
      {accountId:"b",difference:"12.50",reason:"Unknown adjustment"}
    ]);
  });

  it("clears the block only when every account is resolved",()=>{
    const result=summarizeReconciliationState([
      {accountId:"a",difference:"0",reason:null,resolved:true},
      {accountId:"b",difference:"0",reason:null,resolved:true}
    ],false);
    expect(result).toEqual({strategyResolved:true,state:null});
  });

  it("keeps a resumed strategy blocked until its opening reconciliation is complete",()=>{
    const result=summarizeReconciliationState([],true);
    expect(result.strategyResolved).toBe(false);
    expect(result.state).toEqual({accounts:[],resumeNeedsReconciliation:true});
  });
});
