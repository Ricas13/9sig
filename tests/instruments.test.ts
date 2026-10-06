import { describe,expect,it } from "vitest";
import { resolveMapping } from "../src/domain/instruments";

const base={economicExposure:"NASDAQ_100_3X_LONG",leverage:"3.000000",direction:"LONG",country:"GB",wrapper:"ISA",broker:null,preferredCurrency:"GBP",fidelity:"EXACT",effectiveFrom:"2026-01-01",effectiveTo:null};
describe("regional instrument resolver",()=>{
  it("prefers a broker-specific exact mapping",()=>{
    const result=resolveMapping([
      {id:"generic",tradingLineId:"a",...base},
      {id:"specific",tradingLineId:"b",...base,broker:"Example Broker"}
    ],{economicExposure:base.economicExposure,leverage:base.leverage,direction:"LONG",country:"GB",wrapper:"ISA",broker:"Example Broker",preferredCurrency:"GBP",asOf:"2026-10-01"});
    expect(result?.id).toBe("specific");
  });
  it("refuses economically different leverage",()=>{
    const result=resolveMapping([{id:"x",tradingLineId:"a",...base,leverage:"2.000000"}],{economicExposure:base.economicExposure,leverage:"3.000000",direction:"LONG",country:"GB",wrapper:"ISA",preferredCurrency:"GBP",asOf:"2026-10-01"});
    expect(result).toBeNull();
  });
});
