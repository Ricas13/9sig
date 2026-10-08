import { afterAll,beforeAll,describe,expect,it } from "vitest";
import postgres from "postgres";
import { createDeliveriesForNotification,processPendingDeliveries } from "@/lib/notification-service";
import { encryptSecret } from "@/lib/crypto";

// Real notification service against the real database; the email provider is the built-in mock.
const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:2,prepare:false}):null;

describe.skipIf(!url)("notification delivery pipeline",()=>{
  const run=Math.random().toString(36).slice(2,10);
  const userIds:string[]=[];

  async function userOnPro(label:string){
    const users=await sql!.unsafe("INSERT INTO users (email,password_hash) VALUES ($1,'x') RETURNING id",[`nd-${label}-${run}@example.test`]);
    const userId=String(users[0].id);
    userIds.push(userId);
    const pro=await sql!.unsafe("SELECT id FROM plans WHERE slug='pro'");
    await sql!.unsafe("INSERT INTO subscriptions (user_id,plan_id,status,cadence) VALUES ($1,$2,'ACTIVE','MONTHLY')",[userId,pro[0].id]);
    return userId;
  }
  async function notificationFor(userId:string){
    const rows=await sql!.unsafe("INSERT INTO notifications (user_id,type,title,body) VALUES ($1,'INFO','Title','Body') RETURNING id",[userId]);
    return String(rows[0].id);
  }
  async function deliveries(notificationId:string){
    const rows=await sql!.unsafe("SELECT channel,status,attempt_count,last_error_code FROM notification_deliveries WHERE notification_id=$1 ORDER BY channel",[notificationId]);
    return rows.map((r)=>({channel:String(r.channel),status:String(r.status),attempts:Number(r.attempt_count),error:r.last_error_code?String(r.last_error_code):null}));
  }

  beforeAll(()=>{
    process.env.EMAIL_PROVIDER="mock";
    process.env.APP_ENCRYPTION_KEY??="MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
  });
  afterAll(async()=>{
    if(!sql)return;
    await sql.unsafe("DELETE FROM users WHERE id=ANY($1::uuid[])",[userIds]);
    await sql.end();
  });

  it("does not queue a Discord delivery for a user who never connected Discord",async()=>{
    const userId=await userOnPro("no-discord");
    const notificationId=await notificationFor(userId);
    await createDeliveriesForNotification(notificationId);
    expect((await deliveries(notificationId)).map((d)=>d.channel)).toEqual(["EMAIL"]);
  });

  it("queues and sends email for that user, leaving nothing to retry or dead-letter",async()=>{
    const userId=await userOnPro("email-only");
    const notificationId=await notificationFor(userId);
    await createDeliveriesForNotification(notificationId);
    await processPendingDeliveries(500);
    expect(await deliveries(notificationId)).toEqual([{channel:"EMAIL",status:"SENT",attempts:1,error:null}]);
  });

  it("queues Discord when an enabled webhook exists",async()=>{
    const userId=await userOnPro("with-discord");
    await sql!.unsafe("INSERT INTO notification_endpoints (user_id,channel,encrypted_destination,enabled) VALUES ($1,'DISCORD',$2,true)",[userId,encryptSecret("https://discord.com/api/webhooks/1/abc")]);
    const notificationId=await notificationFor(userId);
    await createDeliveriesForNotification(notificationId);
    expect((await deliveries(notificationId)).map((d)=>d.channel)).toEqual(["DISCORD","EMAIL"]);
  });

  it("cancels, rather than retries to exhaustion, a Discord delivery whose webhook was removed",async()=>{
    const userId=await userOnPro("removed-discord");
    await sql!.unsafe("INSERT INTO notification_endpoints (user_id,channel,encrypted_destination,enabled) VALUES ($1,'DISCORD',$2,true)",[userId,encryptSecret("https://discord.com/api/webhooks/1/abc")]);
    const notificationId=await notificationFor(userId);
    await createDeliveriesForNotification(notificationId);
    await sql!.unsafe("UPDATE notification_endpoints SET enabled=false WHERE user_id=$1",[userId]);
    await processPendingDeliveries(500);
    const discord=(await deliveries(notificationId)).find((d)=>d.channel==="DISCORD");
    expect(discord).toMatchObject({status:"CANCELLED",error:"NO_ENDPOINT"});
  });
});
