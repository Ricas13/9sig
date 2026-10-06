import { afterAll,describe,expect,it } from "vitest";
import postgres from "postgres";

const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:1,prepare:false}):null;

describe.skipIf(!url)("database schema",()=>{
  afterAll(async()=>{if(sql)await sql.end();});
  it("contains the critical financial tables",async()=>{
    const rows=await sql!.unsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names=new Set(rows.map((r)=>String(r.table_name)));
    for(const name of ["strategy_instances","strategy_versions","ledger_events","actions","reconciliations","overrides","notification_deliveries","anonymous_aggregates"])expect(names.has(name)).toBe(true);
  });
  it("uses numeric rather than floating point for money",async()=>{
    const rows=await sql!.unsafe("SELECT data_type FROM information_schema.columns WHERE table_name='ledger_events' AND column_name='cash_amount'");
    expect(rows[0]?.data_type).toBe("numeric");
  });
  it("has a unique notification delivery dedupe key",async()=>{
    const rows=await sql!.unsafe("SELECT indexdef FROM pg_indexes WHERE tablename='notification_deliveries'");
    expect(rows.some((r)=>String(r.indexdef).includes("(dedupe_key)"))).toBe(true);
  });
});
