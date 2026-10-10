import { describe, expect, it } from "vitest";
import { assessStrategyMarket, requiredPositions, type VerifiedCandidate } from "@/domain/strategy/market-eligibility";

const hfea = {allocations:[
  {exposure:"US_EQUITY_3X_LONG",weight:"0.55"},
  {exposure:"LONG_TREASURY_3X_LONG",weight:"0.45"}
]};
const asOf="2026-10-09";
function m(exposure:string, ticker:string, country="US", wrapper="TAXABLE", extra:Partial<VerifiedCandidate>={}):VerifiedCandidate {
  return {
    id: ticker, economicExposure:exposure, leverage:"3", direction:"LONG",
    country, wrapper, broker:null, preferredCurrency:"USD", fidelity:"EXACT",
    effectiveFrom:"2026-01-01", effectiveTo:null, tradingLineId:ticker,
    tradingLineCurrency:"USD", tradingLineEffectiveFrom:"2026-01-01", tradingLineEffectiveTo:null,
    ticker, exchange:"NYSE", ...extra
  };
}
const us=[m("US_EQUITY_3X_LONG","UPRO"),m("LONG_TREASURY_3X_LONG","TMF")];
describe("curated strategy market eligibility",()=>{
  it("preserves HFEA's exact 55/45 exposures and 3x leverage",()=>{
    expect(requiredPositions("FIXED_ALLOCATION",hfea)).toEqual([
      {economicExposure:"US_EQUITY_3X_LONG",leverage:"3",direction:"LONG"},
      {economicExposure:"LONG_TREASURY_3X_LONG",leverage:"3",direction:"LONG"}
    ]);
  });
  it("resolves every US leg without letting the customer change the rules",()=>{
    const result=assessStrategyMarket("FIXED_ALLOCATION",hfea,us,{country:"US",wrapper:"TAXABLE",currency:"USD"},asOf);
    expect(result.available).toBe(true);
    expect(result.positions.map(p=>p.ticker)).toEqual(["UPRO","TMF"]);
  });
  it("rejects a UK ISA with only an equity replacement and lists the actually complete US market",()=>{
    const partial=[...us,m("US_EQUITY_3X_LONG","SPY3","GB","ISA",{tradingLineCurrency:"GBP",preferredCurrency:"GBP"})];
    const result=assessStrategyMarket("FIXED_ALLOCATION",hfea,partial,{country:"GB",wrapper:"ISA",currency:"GBP"},asOf);
    expect(result.available).toBe(false);
    expect(result.missingExposures).toEqual(["LONG_TREASURY_3X_LONG"]);
    expect(result.supportedMarkets).toEqual(["US / TAXABLE (USD)"]);
  });
  it("never accepts a 10-year bond product as the 20+ year Treasury exposure",()=>{
    const partial=[...us,m("INTERMEDIATE_TREASURY","3TYL","GB","ISA",{leverage:"3",tradingLineCurrency:"GBP"})];
    expect(assessStrategyMarket("FIXED_ALLOCATION",hfea,partial,{country:"GB",wrapper:"ISA",currency:"GBP"},asOf).available).toBe(false);
  });
  it("fails closed on wrong leverage, outdated mappings, wrong currency and ambiguous top-ranked trading lines",()=>{
    for(const change of [
      {leverage:"1"}, {fidelity:"CANDIDATE"}, {effectiveTo:"2025-12-31"},
      {tradingLineCurrency:"GBP"}, {tradingLineEffectiveTo:"2025-12-31"}
    ]) {
      const altered=[us[0],{...us[1],...change}];
      expect(assessStrategyMarket("FIXED_ALLOCATION",hfea,altered,{country:"US",wrapper:"TAXABLE",currency:"USD"},asOf).available,JSON.stringify(change)).toBe(false);
    }
    const ambiguous=[...us,{...us[1],id:"another",ticker:"TMF2",tradingLineId:"another"}];
    expect(assessStrategyMarket("FIXED_ALLOCATION",hfea,ambiguous,{country:"US",wrapper:"TAXABLE",currency:"USD"},asOf).available).toBe(false);
  });
  it("enforces broker-specific entries without leaking them into general eligibility",()=>{
    const restricted=[m("US_EQUITY_3X_LONG","UPRO","US","TAXABLE",{broker:"Broker A"}),
      m("LONG_TREASURY_3X_LONG","TMF","US","TAXABLE",{broker:"Broker A"})];
    expect(assessStrategyMarket("FIXED_ALLOCATION",hfea,restricted,{country:"US",wrapper:"TAXABLE",currency:"USD"},asOf).available).toBe(false);
    expect(assessStrategyMarket("FIXED_ALLOCATION",hfea,restricted,{country:"US",wrapper:"TAXABLE",currency:"USD",broker:"Broker A"},asOf).available).toBe(true);
  });
  it("fails closed when a research momentum universe omits or corrupts a required leg",()=>{
    const choice={country:"US",wrapper:"TAXABLE",currency:"USD"};
    const candidates=[m("US_EQUITY_3X_LONG","UPRO"),m("LONG_TREASURY_3X_LONG","TMF")];
    for (const config of [
      {riskAssets:["US_EQUITY_3X_LONG"]},
      {riskAssets:["US_EQUITY_3X_LONG"],defensiveAsset:""},
      {riskAssets:["US_EQUITY_3X_LONG",null],defensiveAsset:"LONG_TREASURY_3X_LONG"},
      {riskAssets:[],defensiveAsset:"LONG_TREASURY_3X_LONG"},
      {riskAssets:["US_EQUITY_3X_LONG","US_EQUITY_3X_LONG"],defensiveAsset:"LONG_TREASURY_3X_LONG"},
      {riskAssets:["US_EQUITY_3X_LONG"],defensiveAsset:"US_EQUITY_3X_LONG"}
    ]) {
      const result=assessStrategyMarket("MOMENTUM_ROTATION",config,candidates,choice,asOf);
      expect(result.available,JSON.stringify(config)).toBe(false);
      expect(result.supportedMarkets).toEqual([]);
      expect(result.positions).toEqual([]);
    }
  });
  it("rejects duplicate fixed-allocation sleeves rather than double-counting one trading line",()=>{
    const config={allocations:[
      {exposure:"US_EQUITY_3X_LONG",weight:"0.55"},
      {exposure:"US_EQUITY_3X_LONG",weight:"0.45"}
    ]};
    const result=assessStrategyMarket("FIXED_ALLOCATION",config,us,
      {country:"US",wrapper:"TAXABLE",currency:"USD"},asOf);
    expect(result.available).toBe(false);
    expect(result.positions).toEqual([]);
    expect(result.supportedMarkets).toEqual([]);
    expect(result.missingExposures).toEqual(["Unverified strategy rules"]);
  });
  it("does not mark an undefined strategy engine or incomplete allocation config available",()=>{
    expect(assessStrategyMarket("CUSTOM",{},us,{country:"US",wrapper:"TAXABLE",currency:"USD"},asOf).available).toBe(false);
    expect(assessStrategyMarket("FIXED_ALLOCATION",{allocations:[{weight:"1"}]},us,{country:"US",wrapper:"TAXABLE",currency:"USD"},asOf).available).toBe(false);
  });
});
