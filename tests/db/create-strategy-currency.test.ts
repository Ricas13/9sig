import { afterAll,describe,expect,it } from "vitest";
import postgres from "postgres";
import { createStrategy } from "@/lib/strategy-service";

const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:1,prepare:false}):null;

describe.skipIf(!url)("strategy creation normalises currency",()=>{
  const run=Math.random().toString(36).slice(2,10);
  const users:string[]=[];
  async function user(label:string){
    const rows=await sql!.unsafe("INSERT INTO users (email,password_hash) VALUES ($1,'x') RETURNING id",[`cc-${label}-${run}@example.test`]);
    const id=String(rows[0].id);
    users.push(id);
    const plan=await sql!.unsafe("SELECT id FROM plans WHERE slug='pro'");
    await sql!.unsafe("INSERT INTO subscriptions (user_id,plan_id,status,cadence) VALUES ($1,$2,'ACTIVE','MONTHLY')",[id,plan[0].id]);
    return id;
  }
  const input=(currency:string)=>({strategyKey:"9sig",name:"Currency case",wrapper:"ISA",currency,onboardingMode:"START_NEW" as const,startingCash:"100"});

  afterAll(async()=>{
    if(!sql)return;
    await sql.unsafe("DELETE FROM users WHERE id=ANY($1::uuid[])",[users]);
    await sql.end();
  });

  it("stores a lower-case currency as upper-case on the account and the opening cash entry",async()=>{
    const id=await user("lower");
    const strategyId=await createStrategy(id,"GB",input("gbp"));
    const account=await sql!.unsafe("SELECT a.currency FROM strategy_instances i JOIN accounts a ON a.id=i.account_id WHERE i.id=$1",[strategyId]);
    expect(account[0].currency).toBe("GBP");
    const ledger=await sql!.unsafe("SELECT currency FROM ledger_events WHERE strategy_instance_id=$1",[strategyId]);
    expect(ledger.map((r)=>String(r.currency))).toEqual(["GBP"]);
  });

  it("rejects something that is not a three-letter code",async()=>{
    const id=await user("bad");
    await expect(createStrategy(id,"GB",input("1$3"))).rejects.toThrow("INVALID_CURRENCY");
    const created=await sql!.unsafe("SELECT count(*)::int AS n FROM strategy_instances WHERE user_id=$1",[id]);
    expect(created[0].n).toBe(0);
  });
});
