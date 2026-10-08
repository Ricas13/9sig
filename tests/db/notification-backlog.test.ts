import { afterAll,beforeAll,describe,expect,it } from "vitest";
import postgres from "postgres";
import { createPendingDeliveries,processDeliveryBacklog } from "@/lib/notification-service";

// Real service, real database, built-in mock email provider. Assertions are scoped to rows this
// file created, because other test files share the database.
const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:2,prepare:false}):null;

describe.skipIf(!url)("notification worker backlog",()=>{
  const run=Math.random().toString(36).slice(2,10);
  const userIds:string[]=[];

  async function user(label:string,plan:"free"|"pro"){
    const users=await sql!.unsafe("INSERT INTO users (email,password_hash) VALUES ($1,'x') RETURNING id",[`nb-${label}-${run}@example.test`]);
    const id=String(users[0].id);
    userIds.push(id);
    const planRow=await sql!.unsafe("SELECT id FROM plans WHERE slug=$1",[plan]);
    await sql!.unsafe("INSERT INTO subscriptions (user_id,plan_id,status,cadence) VALUES ($1,$2,'ACTIVE','MONTHLY')",[id,planRow[0].id]);
    return id;
  }
  async function drainPending(){
    // Same loop the worker runs.
    for(let guard=0;guard<500;guard+=1)if(await createPendingDeliveries(200)<200)return;
  }

  beforeAll(()=>{process.env.EMAIL_PROVIDER="mock";});
  afterAll(async()=>{
    if(!sql)return;
    await sql.unsafe("DELETE FROM users WHERE id=ANY($1::uuid[])",[userIds]);
    await sql.end();
  });

  it("does not let in-app-only notifications starve everyone else's reminders",async()=>{
    const free=await user("free","free");
    const pro=await user("pro","pro");
    // 205 old notifications for an in-app-only user, then one newer notification for a paid user.
    await sql!.unsafe(
      "INSERT INTO notifications (user_id,type,title,body,created_at) SELECT $1,'INFO','old '||g,'b',now()-interval '1 day'+g*interval '1 second' FROM generate_series(1,205) g",
      [free]
    );
    const alert=await sql!.unsafe("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'INFO','Pro alert','b') RETURNING id",[pro]);
    await drainPending();
    const deliveries=await sql!.unsafe("SELECT channel FROM notification_deliveries WHERE notification_id=$1",[alert[0].id]);
    expect(deliveries.map((d)=>String(d.channel))).toEqual(["EMAIL"]);
    // Every one of this file's notifications is now marked processed, including the in-app-only ones.
    const unprocessed=await sql!.unsafe("SELECT count(*)::int AS n FROM notifications WHERE user_id=ANY($1::uuid[]) AND deliveries_created_at IS NULL",[[free,pro]]);
    expect(unprocessed[0].n).toBe(0);
  });

  it("does not select an already processed notification again",async()=>{
    const free=await user("again","free");
    await sql!.unsafe("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'INFO','t','b')",[free]);
    await drainPending();
    const marked=await sql!.unsafe("SELECT deliveries_created_at FROM notifications WHERE user_id=$1",[free]);
    const first=String(marked[0].deliveries_created_at);
    await drainPending();
    expect(String((await sql!.unsafe("SELECT deliveries_created_at FROM notifications WHERE user_id=$1",[free]))[0].deliveries_created_at)).toBe(first);
  });

  it("drains a backlog larger than one batch within the time budget",async()=>{
    const pro=await user("backlog","pro");
    await sql!.unsafe("INSERT INTO notifications (user_id,type,title,body) SELECT $1,'INFO','n'||g,'b' FROM generate_series(1,130) g",[pro]);
    await drainPending();
    const result=await processDeliveryBacklog({budgetMs:60_000,batch:50});
    expect(result.exhausted).toBe(true);
    const states=await sql!.unsafe(
      "SELECT d.status,count(*)::int AS n FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.user_id=$1 GROUP BY d.status",
      [pro]
    );
    expect(states.map((r)=>({status:String(r.status),n:Number(r.n)}))).toEqual([{status:"SENT",n:130}]);
  });

  it("stops at the budget instead of running on, and says it is not finished",async()=>{
    const result=await processDeliveryBacklog({budgetMs:0,batch:100});
    expect(result).toEqual({sent:0,claimed:0,exhausted:false});
  });
});
