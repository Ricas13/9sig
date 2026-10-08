import {describe,expect,it} from "vitest";
import {parseManualOverride,validatedEffectivePrice} from "../src/domain/manual-override";
const now=new Date("2026-10-08T13:00:00Z");
const valid={fieldKey:"market_price:123e4567-e89b-12d3-a456-426614174000",manualValue:"100.12",reason:"Broker reference price correction",observedAt:"2026-10-08T12:00:00Z",confirmed:true};
describe("manual override monetary safety",()=>{
 it("retains observation evidence and auto-expires user prices",()=>{
  const parsed=parseManualOverride(valid,now);
  expect(parsed.manualValue).toBe("100.12");
  expect(parsed.expiresAt?.toISOString()).toBe("2026-10-09T01:00:00.000Z");
 });
 it("rejects unowned arbitrary fields, absent acknowledgement and unsafe values",()=>{
  for(const fields of [
   {...valid,fieldKey:"strategy_state.forceReview"},
   {...valid,confirmed:false},
   {...valid,manualValue:"NaN"},
   {...valid,manualValue:"-1"},
   {...valid,manualValue:"0"},
   {...valid,reason:"bad"},
   {...valid,observedAt:"2026-10-01T12:00:00Z"}
  ])expect(()=>parseManualOverride(fields,now)).toThrow();
 });
 it("allows a bounded nonnegative target without a fake provider timestamp",()=>{
  expect(parseManualOverride({fieldKey:"strategy_state.targetValue",manualValue:"0",reason:"Correct original value target",confirmed:true},now).manualValue).toBe("0");
 });
 it("never lets a malformed price into calculations",()=>{
  expect(validatedEffectivePrice("110").toString()).toBe("110");
  expect(()=>validatedEffectivePrice(null)).toThrow();
  expect(()=>validatedEffectivePrice("-10")).toThrow();
  expect(()=>validatedEffectivePrice("NaN")).toThrow();
 });
});
