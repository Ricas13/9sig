import { describe,expect,it } from "vitest";
import { canTransitionAction } from "../src/domain/actions";
describe("action lifecycle",()=>{
  it("allows calculated to executed and executed to reconciled",()=>{expect(canTransitionAction("CALCULATED","EXECUTED")).toBe(true);expect(canTransitionAction("EXECUTED","RECONCILED")).toBe(true);});
  it("does not allow a reconciled action to become calculated again",()=>{expect(canTransitionAction("RECONCILED","CALCULATED")).toBe(false);});
  it("permits superseding unresolved actions",()=>{expect(canTransitionAction("NOTIFIED","SUPERSEDED")).toBe(true);});
});
