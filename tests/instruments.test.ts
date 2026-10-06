import { describe,expect,it } from "vitest";
import { resolveMapping } from "../src/domain/instruments";

const base={
  economicExposure:"NASDAQ_100_3X_LONG",
  leverage:"3.000000",
  direction:"LONG",
  country:"GB",
  wrapper:"ISA",
  broker:null,
  preferredCurrency:"GBP",
  fidelity:"EXACT",
  effectiveFrom:"2026-01-01",
  effectiveTo:null,
  tradingLineCurrency:"GBP",
  tradingLineEffectiveFrom:"2026-01-01",
  tradingLineEffectiveTo:null
};

describe("regional instrument resolver",()=>{
  it("prefers a broker-specific exact mapping",()=>{
    const result=resolveMapping([
      {id:"generic",tradingLineId:"a",...base},
      {id:"specific",tradingLineId:"b",...base,broker:"Example Broker"}
    ],{economicExposure:base.economicExposure,leverage:base.leverage,direction:"LONG",country:"GB",wrapper:"ISA",broker:"Example Broker",preferredCurrency:"GBP",asOf:"2026-10-01"  it("does not use a broker-specific mapping when no broker is known",()=>{
    const result=resolveMapping([{id:"specific",tradingLineId:"a",...base,broker:"Example Broker"}],{economicExposure:base.economicExposure,leverage:base.leverage,direction:"LONG",country:"GB",wrapper:"ISA",broker:null,preferredCurrency:"GBP",asOf:"2026-10-01"});
    expect(result).toBeNull();
  });
  it("does not cross a mapping preferred-currency boundary",()=>{
    const result=resolveMapping([{id:"eur",tradingLineId:"a",...base,preferredCurrency:"EUR",tradingLineCurrency:"GBP"}],{economicExposure:base.economicExposure,leverage:base.leverage,direction:"LONG",country:"GB",wrapper:"ISA",broker:null,preferredCurrency:"GBP",asOf:"2026-10-01"});
    expect(result).toBeNull();
  });
});
    expect(result?.id).toBe("specific");
  });

  it("refuses economically different leverage",()=>{
    const result=resolveMapping(
      [{id:"x",tradingLineId:"a",...base,leverage:"2.000000"}],
      {economicExposure:base.economicExposure,leverage:"3.000000",direction:"LONG",country:"GB",wrapper:"ISA",preferredCurrency:"GBP",asOf:"2026-10-01"}
    );
    expect(result).toBeNull();
  });

  it("refuses a trading line in the wrong currency when no FX implementation exists",()=>{
    const result=resolveMapping(
      [{id:"x",tradingLineId:"a",...base,tradingLineCurrency:"USD"}],
      {economicExposure:base.economicExposure,leverage:base.leverage,direction:"LONG",country:"GB",wrapper:"ISA",preferredCurrency:"GBP",asOf:"2026-10-01"}
    );
    expect(result).toBeNull();
  });

  it("refuses an expired trading line even when the mapping is still enabled",()=>{
    const result=resolveMapping(
      [{id:"x",tradingLineId:"a",...base,tradingLineEffectiveTo:"2026-09-30"}],
      {economicExposure:base.economicExposure,leverage:base.leverage,direction:"LONG",country:"GB",wrapper:"ISA",preferredCurrency:"GBP",asOf:"2026-10-01"}
    );
    expect(result).toBeNull();
  });
});
