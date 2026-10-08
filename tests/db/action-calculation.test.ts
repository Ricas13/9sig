import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { sql } from "@/lib/db";
import { calculateAction } from "@/lib/action-service";

// Regression: calculateAction binds a Date (the last review time) as a query parameter. It used to
// throw for every strategy because of the db client's timestamp serializers, so no action was ever
// produced by cron or after a ledger change.
describe.skipIf(!process.env.DATABASE_URL)("action calculation against the database",()=>{
  let userId="";
  let instanceId="";

  beforeAll(async()=>{
    const run=Math.random().toString(36).slice(2,10);
    const user=await sql.unsafe("INSERT INTO users (email,password_hash) VALUES ($1,'x') RETURNING id",["calc-"+run+"@example.test"]);
    userId=String(user[0].id);
    const account=await sql.unsafe("INSERT INTO accounts (user_id,name,wrapper,country,currency) VALUES ($1,'Calc','ISA','GB','GBP') RETURNING id",[userId]);
    const instance=await sql.unsafe(
      "INSERT INTO strategy_instances (user_id,account_id,strategy_definition_id,strategy_version_id,name) "+
      "SELECT $1,$2,d.id,v.id,'Calc' FROM strategy_definitions d JOIN strategy_versions v ON v.strategy_definition_id=d.id WHERE d.key='9sig' AND v.lifecycle_status='PUBLISHED' LIMIT 1 RETURNING id,strategy_version_id",
      [userId,account[0].id]
    );
    instanceId=String(instance[0].id);
    await sql.unsafe("INSERT INTO strategy_accounts (strategy_instance_id,account_id,role) VALUES ($1,$2,'PRIMARY')",[instanceId,account[0].id]);
    await sql.unsafe("INSERT INTO strategy_states (strategy_instance_id,strategy_version_id,state) VALUES ($1,$2,'{\"forceReview\":true}'::jsonb)",[instanceId,instance[0].strategy_version_id]);
    await sql.unsafe("INSERT INTO ledger_events (strategy_instance_id,account_id,occurred_at,event_type,currency,cash_amount) VALUES ($1,$2,now(),'CONTRIBUTION','GBP',1000)",[instanceId,account[0].id]);
  });

  afterAll(async()=>{
    await sql.unsafe("DELETE FROM users WHERE id=$1",[userId]);
    await sql.end();
  });

  it("calculates and stores an action for an active strategy",async()=>{
    const result=await calculateAction(instanceId);
    expect(result.actionId).toBeTruthy();
    const stored=await sql.unsafe("SELECT status FROM actions WHERE id=$1",[result.actionId]);
    expect(stored).toHaveLength(1);
  });

  it("is idempotent: recalculating the same state reuses the action",async()=>{
    const first=await calculateAction(instanceId);
    const second=await calculateAction(instanceId);
    expect(second.actionId).toBe(first.actionId);
  });
});
