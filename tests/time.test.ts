import { describe,expect,it } from "vitest";
import { isoDateInZone,parseExplicitInstant } from "../src/domain/time";

describe("time-zone safety",()=>{
  it("rejects ambiguous timestamps without an offset",()=>{expect(()=>parseExplicitInstant("2026-10-12T14:00:00")).toThrow("TIMESTAMP_OFFSET_REQUIRED");});
  it("preserves the instant and derives exchange-local dates separately",()=>{
    const instant=parseExplicitInstant("2026-10-12T14:00:00+01:00");
    expect(instant.toISOString()).toBe("2026-10-12T13:00:00.000Z");
    expect(isoDateInZone(instant,"Europe/London")).toBe("2026-10-12");
    expect(isoDateInZone(instant,"America/New_York")).toBe("2026-10-12");
  });
});
