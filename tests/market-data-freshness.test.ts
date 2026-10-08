import {describe,it,expect} from "vitest";
import {classifyFreshness} from "../src/domain/market-freshness";
describe("market data freshness",()=>{
  const now=new Date("2026-10-08T10:00:00Z");
  it("accepts recent observed data",()=>expect(classifyFreshness(new Date("2026-10-08T09:00:00Z"),now)).toBe("CURRENT"));
  it("rejects stale data",()=>expect(classifyFreshness(new Date("2026-10-01T00:00:00Z"),now)).toBe("STALE"));
  it("rejects future timestamps",()=>expect(classifyFreshness(new Date("2026-10-09T00:00:00Z"),now)).toBe("STALE"));
  it("rejects invalid dates",()=>expect(classifyFreshness(new Date("invalid"),now)).toBe("STALE"));
});
