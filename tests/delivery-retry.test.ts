import {describe,expect,it} from "vitest";
import {DELIVERY_MAX_ATTEMPTS,retryDelaySeconds} from "../src/domain/delivery-retry";
describe("notification failure recovery",()=>{
 it("exponentially backs off, caps retries, adds deterministic jitter",()=>{
  expect(DELIVERY_MAX_ATTEMPTS).toBe(8);
  const early=retryDelaySeconds(1,"aaa");
  expect(early).toBeGreaterThanOrEqual(30);
  expect(retryDelaySeconds(4,"aaa")).toBeGreaterThan(early);
  expect(retryDelaySeconds(8,"aaa")).toBeLessThanOrEqual(3600);
  expect(retryDelaySeconds(4,"aaa")).toBe(retryDelaySeconds(4,"aaa"));
  expect(retryDelaySeconds(1,"aaa",600)).toBeGreaterThanOrEqual(600);
 });
 it("fails on invalid attempt numbers",()=>{
  expect(()=>retryDelaySeconds(0,"x")).toThrow();
  expect(()=>retryDelaySeconds(-1,"x")).toThrow();
 });
});
