import { describe,expect,it } from "vitest";
import { actionRecalculationDisposition, canTransitionAction } from "../src/domain/actions";
describe("action lifecycle",()=>{
  it("allows calculated to executed and executed to reconciled",()=>{expect(canTransitionAction("CALCULATED","EXECUTED")).toBe(true);expect(canTransitionAction("EXECUTED","RECONCILED")).toBe(true);});
  it("does not allow a reconciled action to become calculated again",()=>{expect(canTransitionAction("RECONCILED","CALCULATED")).toBe(false);});
  it("permits superseding unresolved actions",()=>{expect(canTransitionAction("NOTIFIED","SUPERSEDED")).toBe(true);});
  it("models partial fills explicitly",()=>{
    expect(canTransitionAction("CALCULATED","PARTIALLY_EXECUTED")).toBe(true);
    expect(canTransitionAction("ACKNOWLEDGED","PARTIALLY_EXECUTED")).toBe(true);
    expect(canTransitionAction("PARTIALLY_EXECUTED","EXECUTED")).toBe(false);
  });
  it("permits recalculation to reactivate cancelled or superseded actions",()=>{expect(canTransitionAction("CANCELLED","CALCULATED")).toBe(true);expect(canTransitionAction("SUPERSEDED","CALCULATED")).toBe(true);});
  it("does not notify again for an unchanged active action",()=>{
    expect(actionRecalculationDisposition("CALCULATED")).toEqual({status:"CALCULATED",shouldNotify:false});
    expect(actionRecalculationDisposition("NOTIFIED")).toEqual({status:"NOTIFIED",shouldNotify:false});
  });
  it("notifies when a cancelled action is intentionally reactivated",()=>{
    expect(actionRecalculationDisposition("CANCELLED")).toEqual({status:"CALCULATED",shouldNotify:true});
    expect(actionRecalculationDisposition("SUPERSEDED")).toEqual({status:"CALCULATED",shouldNotify:true});
  });
});
