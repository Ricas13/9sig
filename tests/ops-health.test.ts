import {describe,expect,it} from "vitest";
import {buildAlertEmail,evaluateOps,type OpsSnapshot,type WorkerFact} from "@/domain/ops-health";

const NOW=new Date("2026-10-08T12:00:00Z");
const ago=(minutes:number)=>new Date(NOW.getTime()-minutes*60_000);
const fact=(over:Partial<WorkerFact>={}):WorkerFact=>({latestStatus:"SUCCESS",latestStartedAt:ago(20),previousStatus:"SUCCESS",lastGoodAt:ago(19),...over});
const healthy=(over:Partial<OpsSnapshot>={}):OpsSnapshot=>({
 now:NOW,activeStrategies:10,cron:fact(),marketData:fact(),marketDataExpected:true,backup:{lastSuccessAt:ago(600),expected:true},
 failedWebhooks24h:0,stuckWebhooks:0,deadLetters24h:0,oldPendingDeliveries:0,storeItemsToReview7d:0,duplicateRefunds7d:0,...over
});
const keys=(s:OpsSnapshot)=>evaluateOps(s).map((a)=>a.key).sort();

describe("evaluateOps",()=>{
 it("reports nothing when everything is healthy",()=>expect(keys(healthy())).toEqual([]));

 it("flags an hourly job that stopped, but only when there is work to do",()=>{
  expect(keys(healthy({cron:fact({lastGoodAt:ago(200)})}))).toEqual(["cron-stale"]);
  expect(keys(healthy({cron:fact({lastGoodAt:null})}))).toEqual(["cron-stale"]);
  expect(keys(healthy({activeStrategies:0,cron:fact({lastGoodAt:ago(5000)})}))).toEqual([]);
  expect(keys(healthy({cron:fact({lastGoodAt:ago(140)})}))).toEqual([]);
 });
 it("flags a job that looks stuck, and one that keeps failing or finishing only partly",()=>{
  expect(keys(healthy({cron:fact({latestStatus:"RUNNING",latestStartedAt:ago(45)})}))).toEqual(["cron-stuck"]);
  expect(keys(healthy({cron:fact({latestStatus:"RUNNING",latestStartedAt:ago(5)})}))).toEqual([]);
  expect(keys(healthy({cron:fact({latestStatus:"FAILED"})}))).toEqual(["cron-degraded"]);
  expect(keys(healthy({cron:fact({latestStatus:"PARTIAL",previousStatus:"PARTIAL"})}))).toEqual(["cron-degraded"]);
  expect(keys(healthy({cron:fact({latestStatus:"PARTIAL",previousStatus:"SUCCESS"})}))).toEqual([]);
 });
 it("watches prices only when a provider is expected",()=>{
  expect(keys(healthy({marketData:fact({lastGoodAt:ago(400)})}))).toEqual(["market-data-stale"]);
  expect(keys(healthy({marketData:fact({lastGoodAt:ago(400)}),marketDataExpected:false}))).toEqual([]);
  expect(keys(healthy({marketData:fact({latestStatus:"PARTIAL",previousStatus:"FAILED"})}))).toEqual(["market-data-degraded"]);
 });
 it("watches backups only when the operator expects a heartbeat",()=>{
  expect(keys(healthy({backup:{lastSuccessAt:ago(60*40),expected:true}}))).toEqual(["backup-stale"]);
  expect(keys(healthy({backup:{lastSuccessAt:null,expected:true}}))).toEqual(["backup-stale"]);
  expect(keys(healthy({backup:{lastSuccessAt:null,expected:false}}))).toEqual([]);
 });
 it("flags billing, delivery and manual-review problems",()=>{
  expect(keys(healthy({failedWebhooks24h:1}))).toEqual(["billing-webhooks"]);
  expect(keys(healthy({stuckWebhooks:2}))).toEqual(["billing-webhooks"]);
  expect(keys(healthy({deadLetters24h:3}))).toEqual(["notification-dead-letters"]);
  expect(keys(healthy({oldPendingDeliveries:5}))).toEqual(["notification-backlog"]);
  expect(keys(healthy({storeItemsToReview7d:1,duplicateRefunds7d:1}))).toEqual(["duplicate-refunds","store-review"]);
 });
 it("marks the outages that stop the product as critical",()=>{
  const severity=(s:OpsSnapshot,key:string)=>evaluateOps(s).find((a)=>a.key===key)!.severity;
  expect(severity(healthy({cron:fact({lastGoodAt:null})}),"cron-stale")).toBe("critical");
  expect(severity(healthy({failedWebhooks24h:1}),"billing-webhooks")).toBe("critical");
  expect(severity(healthy({deadLetters24h:1}),"notification-dead-letters")).toBe("warning");
 });
 it("says how long ago, in plain words, without leaking anything about customers",()=>{
  const detail=evaluateOps(healthy({cron:fact({lastGoodAt:ago(60*30)})}))[0].detail;
  expect(detail).toContain("30 hours ago");
  expect(detail).not.toMatch(/@|user/i);
 });
});

describe("buildAlertEmail",()=>{
 const alert={key:"cron-stale",severity:"critical" as const,title:"The hourly job has stopped running",detail:"Last completed 3 hours ago."};
 it("leads with the action for critical problems",()=>{
  const m=buildAlertEmail("Wealtharr",[alert],[]);
  expect(m.subject).toBe("Wealtharr: ACTION NEEDED - The hourly job has stopped running");
  expect(m.text).toContain("[CRITICAL] The hourly job has stopped running");
 });
 it("summarises several problems and announces recoveries",()=>{
  expect(buildAlertEmail("W",[alert,{...alert,key:"b",severity:"warning"}],[]).subject).toBe("W: ACTION NEEDED - 2 operational problems");
  expect(buildAlertEmail("W",[{...alert,severity:"warning"}],[]).subject).toMatch(/attention/);
  const cleared=buildAlertEmail("W",[],[{title:"The hourly job has stopped running"}]);
  expect(cleared.subject).toBe("W: resolved - The hourly job has stopped running");
  expect(cleared.text).toContain("Back to normal");
 });
});
