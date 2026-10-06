import { afterAll,describe,expect,it } from "vitest";
import postgres from "postgres";

const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:1,prepare:false}):null;

describe.skipIf(!url)("database schema",()=>{
  afterAll(async()=>{if(sql)await sql.end();});

  it("contains the critical financial tables",async()=>{
    const rows=await sql!.unsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names=new Set(rows.map((r)=>String(r.table_name)));
    for(const name of ["strategy_instances","strategy_versions","ledger_events","actions","reconciliations","overrides","notification_deliveries","anonymous_aggregates","strategy_version_migrations"])expect(names.has(name)).toBe(true);
  });

  it("stores strategy engine identity on the version rather than only the mutable definition",async()=>{
    const rows=await sql!.unsafe("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_name='strategy_versions' AND column_name IN ('engine_key','lifecycle_status','upgrade_policy','input_schema')");
    const names=new Set(rows.map((r)=>String(r.column_name)));
    expect(names).toEqual(new Set(["engine_key","lifecycle_status","upgrade_policy","input_schema"]));
    expect(rows.find((r)=>r.column_name==="engine_key")?.is_nullable).toBe("NO");
  });

  it("stores per-instance settings for data-driven strategy setup",async()=>{
    const rows=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='strategy_instances' AND column_name='settings'");
    expect(rows[0]?.data_type).toBe("jsonb");
  });

  it("uses numeric rather than floating point for money",async()=>{
    const rows=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='ledger_events' AND column_name='cash_amount'");
    expect(rows[0]?.data_type).toBe("numeric");
  });

  it("binds ledger positions to exact trading lines",async()=>{
    const rows=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='ledger_events' AND column_name='trading_line_id'");
    expect(rows[0]?.data_type).toBe("uuid");
  });

  it("supports auth revocation and bounded delinquency grace",async()=>{
    const rows=await sql!.unsafe(
      "SELECT table_name,column_name FROM information_schema.columns WHERE (table_name='users' AND column_name='auth_version') OR (table_name='plans' AND column_name='delinquency_grace_days') OR (table_name='subscriptions' AND column_name='billing_grace_until')"
    );
    expect(new Set(rows.map((r)=>String(r.table_name)+"."+String(r.column_name)))).toEqual(new Set([
      "users.auth_version","plans.delinquency_grace_days","subscriptions.billing_grace_until"
    ]));
  });

  it("has the financial and identity uniqueness guards",async()=>{
    const rows=await sql!.unsafe(
      "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE indexname IN ('users_email_lower_unique','ledger_correction_once_unique','notification_action_type_unique','overrides_one_active_unique','regional_mapping_scope_start_unique','notification_delivery_dedupe_unique')"
    );
    const names=new Set(rows.map((r)=>String(r.indexname)));
    for(const name of [
      "users_email_lower_unique",
      "ledger_correction_once_unique",
      "notification_action_type_unique",
      "overrides_one_active_unique",
      "regional_mapping_scope_start_unique",
      "notification_delivery_dedupe_unique"
    ])expect(names.has(name)).toBe(true);
  });
});
