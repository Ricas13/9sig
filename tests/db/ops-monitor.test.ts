import { afterAll,beforeAll,describe,expect,it } from "vitest";
import postgres from "postgres";
import { runOpsCheck } from "@/lib/ops-monitor";
import type { OpsSnapshot } from "@/domain/ops-health";

const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:2,prepare:false}):null;
const BASE=new Date("2026-10-08T12:00:00Z");
const snap=(over:Partial<OpsSnapshot>={},at=BASE):OpsSnapshot=>({
  now:at,activeStrategies:5,
  cron:{latestStatus:"SUCCESS",latestStartedAt:at,previousStatus:"SUCCESS",lastGoodAt:at},
  marketData:{latestStatus:"SUCCESS",latestStartedAt:at,previousStatus:"SUCCESS",lastGoodAt:at},marketDataExpected:false,
  backup:{lastSuccessAt:at,expected:false},failedWebhooks24h:0,stuckWebhooks:0,deadLetters24h:0,oldPendingDeliveries:0,storeItemsToReview7d:0,duplicateRefunds7d:0,...over
});
const hoursLater=(h:number)=>new Date(BASE.getTime()+h*3_600_000);

describe.skipIf(!url)("operational alerting",()=>{
  const run=Math.random().toString(36).slice(2,8);
  const adminEmail=`ops-admin-${run}@example.test`, extra=`oncall-${run}@example.test`;
  let adminId="";
  const saved:Record<string,string|undefined>={};
  const sent:Array<{to:string;subject:string;text:string}>=[];
  let failSends=false;
  const send=async(to:string,subject:string,text:string)=>{if(failSends)return false;sent.push({to,subject,text});return true;};
  const mine=()=>sent.filter((m)=>m.to===adminEmail);

  beforeAll(async()=>{
    for(const k of ["OPS_ALERTS_ENABLED","OPS_ALERT_EXTRA_EMAIL"])saved[k]=process.env[k];
    process.env.OPS_ALERTS_ENABLED="true";
    process.env.OPS_ALERT_EXTRA_EMAIL=extra;
    await sql!.unsafe("DELETE FROM ops_alert_state");
    const u=await sql!.unsafe("INSERT INTO users (email,password_hash,role) VALUES ($1,'x','ADMIN') RETURNING id",[adminEmail]);
    adminId=String(u[0].id);
  });
  afterAll(async()=>{
    for(const k of Object.keys(saved)){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
    if(!sql)return;
    await sql.unsafe("DELETE FROM ops_alert_state");
    await sql.unsafe("DELETE FROM users WHERE id=$1",[adminId]);
    await sql.end();
  });

  it("stays silent and stores nothing when alerting is switched off",async()=>{
    process.env.OPS_ALERTS_ENABLED="false";
    const result=await runOpsCheck({snapshot:snap({failedWebhooks24h:2}),send});
    expect(result).toMatchObject({enabled:false,notified:0});
    expect(result.alerts.map((a)=>a.key)).toEqual(["billing-webhooks"]);
    expect(sent).toHaveLength(0);
    expect((await sql!.unsafe("SELECT count(*)::int AS n FROM ops_alert_state"))[0].n).toBe(0);
    process.env.OPS_ALERTS_ENABLED="true";
  });

  it("emails every administrator and the extra address once when a problem starts",async()=>{
    const result=await runOpsCheck({snapshot:snap({failedWebhooks24h:2}),send});
    expect(result.notified).toBe(1);
    expect(mine()).toHaveLength(1);
    expect(sent.some((m)=>m.to===extra)).toBe(true);
    expect(mine()[0].subject).toMatch(/ACTION NEEDED/);
    expect(mine()[0].text).toContain("Billing notifications are failing");
  });

  it("does not repeat itself within a day, then reminds once a day while it lasts",async()=>{
    await runOpsCheck({snapshot:snap({failedWebhooks24h:2},hoursLater(2)),send});
    await runOpsCheck({snapshot:snap({failedWebhooks24h:2},hoursLater(23)),send});
    expect(mine()).toHaveLength(1);
    await runOpsCheck({snapshot:snap({failedWebhooks24h:2},hoursLater(25)),send});
    expect(mine()).toHaveLength(2);
    await runOpsCheck({snapshot:snap({failedWebhooks24h:2},hoursLater(26)),send});
    expect(mine()).toHaveLength(2);
  });

  it("reports a second problem without re-announcing the first, and tells you when they clear",async()=>{
    const before=mine().length;
    await runOpsCheck({snapshot:snap({failedWebhooks24h:2,deadLetters24h:4},hoursLater(27)),send});
    expect(mine()).toHaveLength(before+1);
    const news=mine().at(-1)!;
    expect(news.text).toContain("Notifications could not be delivered");
    expect(news.text).not.toContain("Billing notifications are failing");

    const cleared=await runOpsCheck({snapshot:snap({},hoursLater(28)),send});
    expect(cleared.resolved).toBe(2);
    const last=mine().at(-1)!;
    expect(last.subject).toMatch(/resolved/);
    expect(last.text).toContain("Back to normal");
    // Quiet afterwards.
    const count=mine().length;
    await runOpsCheck({snapshot:snap({},hoursLater(29)),send});
    expect(mine()).toHaveLength(count);
  });

  it("announces a problem that comes back after it cleared",async()=>{
    const count=mine().length;
    await runOpsCheck({snapshot:snap({failedWebhooks24h:1},hoursLater(30)),send});
    expect(mine()).toHaveLength(count+1);
    await runOpsCheck({snapshot:snap({},hoursLater(31)),send});
  });

  it("retries on the next check when email cannot be sent, instead of losing the alert",async()=>{
    failSends=true;
    const count=sent.length;
    const failed=await runOpsCheck({snapshot:snap({duplicateRefunds7d:1},hoursLater(32)),send});
    expect(failed.notified).toBe(0);
    expect(sent).toHaveLength(count);
    failSends=false;
    const retried=await runOpsCheck({snapshot:snap({duplicateRefunds7d:1},hoursLater(33)),send});
    expect(retried.notified).toBe(1);
    expect(mine().at(-1)!.text).toContain("Duplicate subscriptions may need a refund");
  });

  it("gathers a real snapshot from the database without error",async()=>{
    const {gatherSnapshot}=await import("@/lib/ops-monitor");
    const snapshot=await gatherSnapshot();
    expect(snapshot.activeStrategies).toBeGreaterThanOrEqual(0);
    expect(snapshot.now).toBeInstanceOf(Date);
  });
});

describe.skipIf(!url)("monitor endpoints",()=>{
  const SECRET="ops-endpoint-secret-"+Math.random().toString(36).slice(2);
  let saved:string|undefined;
  const db=url?postgres(url,{max:1,prepare:false}):null;
  beforeAll(()=>{saved=process.env.CRON_SECRET;process.env.CRON_SECRET=SECRET;});
  afterAll(async()=>{
    if(saved===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=saved;
    await db!.unsafe("DELETE FROM worker_runs WHERE worker_key='backup'");
    await db!.end();
  });
  const call=async(mod:"health"|"heartbeat",method:"GET"|"POST",auth?:string,body?:unknown)=>{
    const route=mod==="health"?await import("@/app/api/cron/health/route"):await import("@/app/api/cron/heartbeat/route");
    const handler=(route as unknown as Record<string,(r:Request)=>Promise<Response>>)[method];
    return handler(new Request("http://localhost/api/cron/"+mod,{method,headers:{...(auth?{authorization:auth}:{}),"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)}));
  };

  it("refuses callers without the job secret",async()=>{
    expect((await call("health","GET")).status).toBe(401);
    expect((await call("health","GET","Bearer nope")).status).toBe(401);
    expect((await call("heartbeat","POST","Bearer nope",{worker:"backup"})).status).toBe(401);
  });
  it("answers a health check with the current problems, 503 when one is critical",async()=>{
    const response=await call("health","GET","Bearer "+SECRET);
    expect([200,503]).toContain(response.status);
    const body=await response.json() as {ok:boolean;alerts:unknown[]};
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body.ok).toBe(response.status===200);
  });
  it("records a backup heartbeat and rejects unknown workers",async()=>{
    expect((await call("heartbeat","POST","Bearer "+SECRET,{worker:"backup"})).status).toBe(200);
    const row=await db!.unsafe("SELECT status FROM worker_runs WHERE worker_key='backup' ORDER BY started_at DESC LIMIT 1");
    expect(row[0].status).toBe("SUCCESS");
    expect((await call("heartbeat","POST","Bearer "+SECRET,{worker:"cron-actions"})).status).toBe(400);
    expect((await call("heartbeat","POST","Bearer "+SECRET)).status).toBe(400);
  });
});
