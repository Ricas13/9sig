import { afterAll,describe,expect,it } from "vitest";
import postgres from "postgres";

const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:1,prepare:false}):null;

describe.skipIf(!url)("database schema",()=>{
  afterAll(async()=>{if(sql)await sql.end();});
  it("contains the critical financial tables",async()=>{
    const rows=await sql!.unsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names=new Set(rows.map((r)=>String(r.table_name)));
    for(const name of ["strategy_instances","strategy_versions","ledger_events","actions","reconciliations","overrides","notification_deliveries","anonymous_aggregates","strategy_version_migrations","benchmark_performance","strategy_version_benchmarks"])expect(names.has(name)).toBe(true);
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
  it("supports account-aware strategy portfolios",async()=>{
    const tables=await sql!.unsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='strategy_accounts'");
    expect(tables.length).toBe(1);

    const ledger=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='ledger_events' AND column_name='account_id'");
    const actions=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='actions' AND column_name='account_id'");
    const reconciliations=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='reconciliations' AND column_name='account_id'");
    expect(ledger[0]?.data_type).toBe("uuid");
    expect(actions[0]?.data_type).toBe("uuid");
    expect(reconciliations[0]?.data_type).toBe("uuid");

    const indexes=await sql!.unsafe("SELECT indexdef FROM pg_indexes WHERE tablename='strategy_accounts'");
    expect(indexes.some((row)=>String(row.indexdef).includes("WHERE (role = 'PRIMARY'"))).toBe(true);
  });

  it("supports multiple named benchmark histories per strategy version",async()=>{
    const rows=await sql!.unsafe("SELECT indexdef FROM pg_indexes WHERE tablename='strategy_version_benchmarks'");
    expect(rows.some((r)=>String(r.indexdef).includes("strategy_version_id"))).toBe(true);
    const performance=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='benchmark_performance' AND column_name='value'");
    expect(performance[0]?.data_type).toBe("numeric");
  });
  it("uses numeric rather than floating point for money",async()=>{
    const rows=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='ledger_events' AND column_name='cash_amount'");
    expect(rows[0]?.data_type).toBe("numeric");
  });
  it("deduplicates retryable financial mutations",async()=>{
    const ledgerColumns=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='ledger_events' AND column_name='request_key'");
    const reconciliationColumns=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='reconciliations' AND column_name='request_key'");
    expect(ledgerColumns[0]?.data_type).toBe("uuid");
    expect(reconciliationColumns[0]?.data_type).toBe("uuid");

    const ledgerIndexes=await sql!.unsafe("SELECT indexdef FROM pg_indexes WHERE tablename='ledger_events'");
    const reconciliationIndexes=await sql!.unsafe("SELECT indexdef FROM pg_indexes WHERE tablename='reconciliations'");
    expect(ledgerIndexes.some((row)=>String(row.indexdef).includes("request_key")&&String(row.indexdef).includes("UNIQUE"))).toBe(true);
    expect(reconciliationIndexes.some((row)=>String(row.indexdef).includes("request_key")&&String(row.indexdef).includes("UNIQUE"))).toBe(true);
  });

  it("has a unique notification delivery dedupe key",async()=>{
    const rows=await sql!.unsafe("SELECT indexdef FROM pg_indexes WHERE tablename='notification_deliveries'");
    expect(rows.some((r)=>String(r.indexdef).includes("(dedupe_key)"))).toBe(true);
  });
});
