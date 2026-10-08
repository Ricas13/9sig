import {describe,expect,it} from "vitest";
import {exchangeTradingDate,historicalBrokerFill} from "../src/domain/historical-trade";
import {foldLedger} from "../src/domain/ledger";
import {nextReviewDueAt} from "../src/domain/schedule";

describe("historical broker fills and date-to-review journey",()=>{
  const time=new Date("2026-11-02T19:00:00.000Z"); // 2pm New York after DST ends
  it("maps timezone across UTC date boundaries, including London and US DST",()=>{
    expect(exchangeTradingDate(new Date("2026-11-03T03:00:00Z"),"NASDAQ")).toBe("2026-11-02");
    expect(exchangeTradingDate(new Date("2026-10-31T23:30:00Z"),"LSE")).toBe("2026-10-31");
    expect(exchangeTradingDate(new Date("2026-01-01T00:30:00Z"),"NYSE")).toBe("2025-12-31");
    expect(()=>exchangeTradingDate(time,"UNKNOWN")).toThrow("UNSUPPORTED_EXCHANGE_TIMEZONE");
  });
  it("records the actual broker fill independently of any indicative provider quote",()=>{
    const fill=historicalBrokerFill({side:"BUY",quantity:"5",unitPrice:"100.12",fee:"1.50",executedAt:time,currency:"USD"},new Date("2026-12-01"));
    expect(fill.quantity.toString()).toBe("5");
    expect(fill.cashAmount.toString()).toBe("-500.6");
    const portfolio=foldLedger([
      {eventType:"CONTRIBUTION",cashAmount:"1000",currency:"USD"},
      {eventType:"BUY",cashAmount:fill.cashAmount,feeAmount:fill.feeAmount,instrumentId:"tqqq",quantity:fill.quantity,currency:"USD"}
    ],"USD");
    expect(portfolio.cash.toString()).toBe("497.9");
    expect(portfolio.quantities.get("tqqq")?.toString()).toBe("5");
    // With no intervening review, a quarterly cycle started at the original fill.
    expect(nextReviewDueAt({lastReviewAt:time,frequency:"QUARTERLY",timeZone:"America/New_York",cutoffLocal:"16:00"}).toISOString())
      .toBe("2027-02-02T21:00:00.000Z");
  });
  it("refuses invented future dates, non-finite and precision-losing fills",()=>{
    const base={side:"BUY" as const,quantity:"1",unitPrice:"100",fee:"0",executedAt:time,currency:"USD"};
    expect(()=>historicalBrokerFill({...base,unitPrice:"NaN"},new Date("2026-12-01"))).toThrow();
    expect(()=>historicalBrokerFill({...base,quantity:"0"},new Date("2026-12-01"))).toThrow();
    expect(()=>historicalBrokerFill({...base,quantity:"0.000000000001",unitPrice:"0.0000000001"},new Date("2026-12-01"))).toThrow("TRADE_NOTIONAL_PRECISION_UNSUPPORTED");
    expect(()=>historicalBrokerFill(base,new Date("2026-10-08"))).toThrow("INVALID_TRADE_TIMESTAMP");
  });
});
