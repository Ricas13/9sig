import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import postgres from "postgres";
import Stripe from "stripe";

// Stripe's network calls are faked; signature verification, the webhook handler, the entitlement
// service and the database are all real. Skipped without DATABASE_URL, like the other DB tests.
const stripeState=vi.hoisted(()=>({
  subscriptions:new Map<string,Record<string,unknown>>(),
  cancelled:[] as string[],
  retrieveFailure:null as Error|null
}));

vi.mock("stripe",async(importOriginal)=>{
  const original=await importOriginal<typeof import("stripe")>();
  const Real=original.default as unknown as new(...args:unknown[])=>object;
  class FakeStripe extends Real {
    subscriptions={
      retrieve:async(id:string)=>{
        if(stripeState.retrieveFailure)throw stripeState.retrieveFailure;
        const found=stripeState.subscriptions.get(id);
        if(!found)throw Object.assign(new Error("No such subscription"),{code:"resource_missing"});
        return found;
      },
      cancel:async(id:string)=>{stripeState.cancelled.push(id);return {id,status:"canceled"};}
    };
  }
  return {...original,default:FakeStripe};
});

const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:2,prepare:false}):null;
const WEBHOOK_SECRET="whsec_lifecycle_test";
const run=Math.random().toString(36).slice(2,10);
const PRICES={investorMonthly:"price_lc_inv_m_"+run,investorAnnual:"price_lc_inv_y_"+run,proAnnual:"price_lc_pro_y_"+run};
const DAY=86_400;
const now=()=>Math.floor(Date.now()/1000);

function subscription(id:string,userId:string,over:{status?:string;price?:string;interval?:"month"|"year";periodEnd?:number;cancelAtPeriodEnd?:boolean;itemPeriod?:boolean}={}){
  const periodEnd=over.periodEnd??now()+30*DAY;
  const item:Record<string,unknown>={price:{id:over.price??PRICES.investorMonthly,recurring:{interval:over.interval??"month"}}};
  const body:Record<string,unknown>={
    id,object:"subscription",status:over.status??"active",customer:"cus_lc_"+run,
    cancel_at_period_end:over.cancelAtPeriodEnd??false,metadata:{userId},items:{data:[item]}
  };
  // Newer API versions report the period per item; older ones on the subscription itself.
  if(over.itemPeriod===false)body.current_period_end=periodEnd;else item.current_period_end=periodEnd;
  return body;
}

let counter=0;
async function deliver(type:string,payloadSubscription:Record<string,unknown>,options:{eventId?:string;stripeNow?:Record<string,unknown>|"gone"}={}){
  const {POST}=await import("@/app/api/stripe/webhook/route");
  const id=String(payloadSubscription.id);
  if(options.stripeNow==="gone")stripeState.subscriptions.delete(id);
  else stripeState.subscriptions.set(id,options.stripeNow??payloadSubscription);
  const payload=JSON.stringify({id:options.eventId??"evt_lc_"+run+"_"+(++counter),object:"event",type,created:now(),data:{object:payloadSubscription}});
  const header=Stripe.webhooks.generateTestHeaderString({payload,secret:WEBHOOK_SECRET});
  const response=await POST(new Request("http://localhost/api/stripe/webhook",{method:"POST",headers:{"stripe-signature":header},body:payload}));
  if(response.status!==200){
    const failed=await sql!.unsafe("SELECT last_error_code FROM billing_webhook_events WHERE event_id=$1",[JSON.parse(payload).id]);
    return {status:response.status,body:null,errorCode:failed[0]?.last_error_code?String(failed[0].last_error_code):null};
  }
  return {status:response.status,body:await response.json() as Record<string,unknown>,errorCode:null};
}

describe.skipIf(!url)("subscription payment lifecycle",()=>{
  let userId="";
  const subA="sub_lc_a_"+run;

  async function row(){
    const rows=await sql!.unsafe("SELECT s.status,s.cadence,s.stripe_subscription_id,s.current_period_end,s.cancel_at_period_end,p.slug FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1",[userId]);
    return rows[0]!;
  }
  async function activeStrategies(){
    const rows=await sql!.unsafe("SELECT id,status FROM strategy_instances WHERE user_id=$1 ORDER BY created_at",[userId]);
    return rows.map((r)=>({id:String(r.id),status:String(r.status)}));
  }

  beforeAll(async()=>{
    process.env.STRIPE_SECRET_KEY="sk_test_lifecycle";
    process.env.STRIPE_WEBHOOK_SECRET=WEBHOOK_SECRET;
    const plans=await sql!.unsafe("SELECT id,slug FROM plans WHERE slug IN ('free','investor','pro')");
    const id=(slug:string)=>String(plans.find((p)=>p.slug===slug)!.id);
    await sql!.unsafe("UPDATE plan_prices SET stripe_price_id=$1 WHERE plan_id=$2 AND currency='GBP' AND cadence='MONTHLY'",[PRICES.investorMonthly,id("investor")]);
    await sql!.unsafe("UPDATE plan_prices SET stripe_price_id=$1 WHERE plan_id=$2 AND currency='GBP' AND cadence='ANNUAL'",[PRICES.investorAnnual,id("investor")]);
    await sql!.unsafe("UPDATE plan_prices SET stripe_price_id=$1 WHERE plan_id=$2 AND currency='GBP' AND cadence='ANNUAL'",[PRICES.proAnnual,id("pro")]);

    const users=await sql!.unsafe("INSERT INTO users (email,password_hash) VALUES ($1,'x') RETURNING id",["lifecycle-"+run+"@example.test"]);
    userId=String(users[0].id);
    await sql!.unsafe("INSERT INTO subscriptions (user_id,plan_id,status,cadence,stripe_customer_id) VALUES ($1,$2,'FREE','FREE',$3)",[userId,id("free"),"cus_lc_"+run]);
    const account=await sql!.unsafe("INSERT INTO accounts (user_id,name,wrapper,country,currency) VALUES ($1,'Lifecycle','ISA','GB','GBP') RETURNING id",[userId]);
    for(let i=0;i<3;i++){
      const created=await sql!.unsafe(
        "INSERT INTO strategy_instances (user_id,account_id,strategy_definition_id,strategy_version_id,name) "+
        "SELECT $1,$2,d.id,v.id,$3 FROM strategy_definitions d JOIN strategy_versions v ON v.strategy_definition_id=d.id WHERE d.key='9sig' AND v.lifecycle_status='PUBLISHED' LIMIT 1 RETURNING id",
        [userId,account[0].id,"Strategy "+i]
      );
      await sql!.unsafe("INSERT INTO strategy_accounts (strategy_instance_id,account_id,role) VALUES ($1,$2,'PRIMARY')",[created[0].id,account[0].id]);
    }
  });

  afterAll(async()=>{
    if(!sql)return;
    await sql.unsafe("DELETE FROM users WHERE id=$1",[userId]);
    await sql.unsafe("DELETE FROM billing_webhook_events WHERE event_id LIKE $1",["evt_lc_"+run+"%"]);
    await sql.unsafe("UPDATE plan_prices SET stripe_price_id=NULL WHERE stripe_price_id=ANY($1)",[Object.values(PRICES)]);
    await sql.end();
  });

  it("activates a paid plan when the first subscription is created",async()=>{
    const periodEnd=now()+30*DAY;
    const result=await deliver("customer.subscription.created",subscription(subA,userId,{periodEnd}));
    expect(result,JSON.stringify(result)).toMatchObject({status:200});
    const current=await row();
    expect(current).toMatchObject({status:"ACTIVE",cadence:"MONTHLY",slug:"investor",stripe_subscription_id:subA});
    expect(Math.floor(new Date(current.current_period_end).getTime()/1000)).toBe(periodEnd);
    expect((await activeStrategies()).every((s)=>s.status==="ACTIVE")).toBe(true);
  });

  it("moves the period end forward on renewal",async()=>{
    const renewed=now()+60*DAY;
    expect((await deliver("customer.subscription.updated",subscription(subA,userId,{periodEnd:renewed}))).status).toBe(200);
    expect(Math.floor(new Date((await row()).current_period_end).getTime()/1000)).toBe(renewed);
  });

  it("still reads the renewal period when Stripe reports it on the subscription instead of the item",async()=>{
    const renewed=now()+90*DAY;
    expect((await deliver("customer.subscription.updated",subscription(subA,userId,{periodEnd:renewed,itemPeriod:false}))).status).toBe(200);
    expect(Math.floor(new Date((await row()).current_period_end).getTime()/1000)).toBe(renewed);
  });

  it("follows a plan and cadence change made in the billing portal",async()=>{
    await deliver("customer.subscription.updated",subscription(subA,userId,{price:PRICES.proAnnual,interval:"year"}));
    expect(await row()).toMatchObject({slug:"pro",cadence:"ANNUAL",status:"ACTIVE"});
    await deliver("customer.subscription.updated",subscription(subA,userId,{price:PRICES.investorMonthly,interval:"month"}));
    expect(await row()).toMatchObject({slug:"investor",cadence:"MONTHLY"});
  });

  it("keeps paid access while payment is past due and after it recovers",async()=>{
    await deliver("customer.subscription.updated",subscription(subA,userId,{status:"past_due"}));
    expect((await row()).status).toBe("PAST_DUE");
    const {loadEntitlements}=await import("@/lib/entitlement-service");
    expect((await loadEntitlements(userId)).planSlug).toBe("investor");
    await deliver("customer.subscription.updated",subscription(subA,userId,{status:"active"}));
    expect((await row()).status).toBe("ACTIVE");
  });

  it("records a scheduled cancellation without ending access",async()=>{
    await deliver("customer.subscription.updated",subscription(subA,userId,{cancelAtPeriodEnd:true}));
    expect(await row()).toMatchObject({cancel_at_period_end:true,status:"ACTIVE",slug:"investor"});
  });

  it("returns to the free plan when the subscription ends and pauses strategies over the free limit",async()=>{
    const ended=subscription(subA,userId,{status:"canceled"});
    expect((await deliver("customer.subscription.deleted",ended)).status).toBe(200);
    expect(await row()).toMatchObject({status:"FREE",cadence:"FREE",stripe_subscription_id:null,slug:"free",cancel_at_period_end:false});
    const strategies=await activeStrategies();
    expect(strategies.filter((s)=>s.status==="ACTIVE")).toHaveLength(1);
    expect(strategies[0].status).toBe("ACTIVE");
    expect(strategies.filter((s)=>s.status==="PAUSED")).toHaveLength(2);
  });

  it("does not hand back a paid plan when a late event describes the ended subscription as active",async()=>{
    const stale=subscription(subA,userId,{status:"active"});
    const result=await deliver("customer.subscription.updated",stale,{stripeNow:subscription(subA,userId,{status:"canceled"})});
    expect(result.status).toBe(200);
    expect(await row()).toMatchObject({status:"FREE",stripe_subscription_id:null,slug:"free"});
  });

  it("treats a subscription Stripe no longer knows about as ended",async()=>{
    const result=await deliver("customer.subscription.updated",subscription(subA,userId,{status:"active"}),{stripeNow:"gone"});
    expect(result.status).toBe(200);
    expect(await row()).toMatchObject({status:"FREE",slug:"free"});
  });

  it("lets the customer subscribe again after cancelling without cancelling the new subscription",async()=>{
    const subB="sub_lc_b_"+run;
    expect((await deliver("customer.subscription.created",subscription(subB,userId,{price:PRICES.investorAnnual,interval:"year"}))).status).toBe(200);
    expect(await row()).toMatchObject({status:"ACTIVE",cadence:"ANNUAL",slug:"investor",stripe_subscription_id:subB});
    expect(stripeState.cancelled).not.toContain(subB);
  });

  it("cancels a second live subscription instead of billing the customer twice",async()=>{
    const subB="sub_lc_b_"+run;
    const duplicate="sub_lc_dup_"+run;
    await deliver("customer.subscription.created",subscription(duplicate,userId));
    expect(stripeState.cancelled).toContain(duplicate);
    expect((await row()).stripe_subscription_id).toBe(subB);
  });

  it("ignores a replayed event",async()=>{
    const subB="sub_lc_b_"+run;
    const before=await row();
    const eventId="evt_lc_"+run+"_replay";
    const event=subscription(subB,userId,{price:PRICES.investorAnnual,interval:"year",periodEnd:now()+400*DAY});
    expect((await deliver("customer.subscription.updated",event,{eventId})).body).toMatchObject({received:true});
    const afterFirst=await row();
    expect(afterFirst.current_period_end).not.toEqual(before.current_period_end);
    stripeState.subscriptions.set(subB,subscription(subB,userId,{price:PRICES.investorAnnual,interval:"year",periodEnd:now()+10*DAY}));
    const replay=await deliver("customer.subscription.updated",event,{eventId,stripeNow:stripeState.subscriptions.get(subB)});
    expect(replay.body).toMatchObject({duplicate:true});
    expect((await row()).current_period_end).toEqual(afterFirst.current_period_end);
  });

  it("fails retryably when Stripe cannot be reached and succeeds when Stripe redelivers",async()=>{
    const subB="sub_lc_b_"+run;
    const eventId="evt_lc_"+run+"_retry";
    const renewed=now()+500*DAY;
    const event=subscription(subB,userId,{price:PRICES.investorAnnual,interval:"year",periodEnd:renewed});
    stripeState.retrieveFailure=new Error("network down");
    expect((await deliver("customer.subscription.updated",event,{eventId})).status).toBe(500);
    stripeState.retrieveFailure=null;
    expect((await deliver("customer.subscription.updated",event,{eventId})).status).toBe(200);
    expect(Math.floor(new Date((await row()).current_period_end).getTime()/1000)).toBe(renewed);
  });

  it("rejects a subscription whose price maps to no plan and leaves the account unchanged",async()=>{
    const subB="sub_lc_b_"+run;
    const before=await row();
    const unknown=subscription(subB,userId,{price:"price_unmapped_"+run});
    (unknown.metadata as Record<string,string>).planId="not-a-real-plan";
    expect((await deliver("customer.subscription.updated",unknown)).status).toBe(500);
    expect(await row()).toMatchObject({slug:before.slug,status:before.status});
  });

  it("rejects events that are not signed by Stripe",async()=>{
    const {POST}=await import("@/app/api/stripe/webhook/route");
    const response=await POST(new Request("http://localhost/api/stripe/webhook",{method:"POST",headers:{"stripe-signature":"t=1,v1=bad"},body:"{}"}));
    expect(response.status).toBe(400);
  });
});
