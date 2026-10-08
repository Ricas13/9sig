import {describe,it,expect} from "vitest";
import {validateHistoricalTradePrice,type TradePriceEvidence} from "../src/domain/historical-trade-price";
const time=new Date("2026-11-02T19:00:00.000Z"); // 2pm New York on 2 November 2026 is EST (UTC-5)
const input:TradePriceEvidence={symbol:"TQQQ",requestedAt:time,observedAt:time,price:"100.12",currency:"USD",provider:"historical-stock-feed",granularity:"TRADE",priceKind:"LAST"};
const opts={symbol:"TQQQ",at:time,currency:"USD"};
describe("historical trade price evidence",()=>{
 it("accepts matching intraday observation, never labels broker fill",()=>{
  expect(validateHistoricalTradePrice(input,opts).exact).toBe(true);
  expect(validateHistoricalTradePrice(input,opts).description).toContain("broker fill");
 });
 it("refuses daily candles for intraday execution",()=>{
  expect(()=>validateHistoricalTradePrice({...input,granularity:"DAILY_BAR",priceKind:"CLOSE"},opts)).toThrow("HISTORICAL_TRADE_INTRADAY_REQUIRED");
 });
 it("refuses bars too far from actual timestamp",()=>{
  expect(()=>validateHistoricalTradePrice({...input,observedAt:new Date("2026-11-02T19:10:00Z"),granularity:"MINUTE_BAR"},opts)).toThrow("HISTORICAL_TRADE_PRICE_TOO_FAR_FROM_EXECUTION");
 });
 it("refuses invented and mismatched prices",()=>{
  expect(()=>validateHistoricalTradePrice({...input,provider:""},opts)).toThrow();
  expect(()=>validateHistoricalTradePrice({...input,symbol:"QQQ"},opts)).toThrow();
  expect(()=>validateHistoricalTradePrice({...input,price:"-1"},opts)).toThrow();
 });
});
