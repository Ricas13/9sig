import { afterAll,describe,expect,it } from "vitest";
import postgres from "postgres";

// JSON columns must hold JSON objects/arrays, never a JSON string wrapping JSON text. A string
// there means a value was encoded twice; code reading named fields then silently gets defaults.
const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:1,prepare:false}):null;

describe.skipIf(!url)("stored JSON shape",()=>{
  afterAll(async()=>{if(sql)await sql.end();});

  it("no jsonb column in the schema contains a double-encoded string",async()=>{
    const columns=await sql!.unsafe("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type='jsonb' ORDER BY 1,2");
    expect(columns.length).toBeGreaterThan(20);
    const offenders:string[]=[];
    for(const {table_name,column_name} of columns){
      const rows=await sql!.unsafe(`SELECT count(*)::int AS n FROM "${table_name}" WHERE jsonb_typeof("${column_name}")='string' AND ("${column_name}" #>> '{}') ~ '^\\s*[\\{\\[]'`);
      if(Number(rows[0].n)>0)offenders.push(`${table_name}.${column_name} (${rows[0].n})`);
    }
    expect(offenders).toEqual([]);
  });

  it("the seeded 9sig rules are readable by name",async()=>{
    const rows=await sql!.unsafe(
      "SELECT v.config FROM strategy_versions v JOIN strategy_definitions d ON d.id=v.strategy_definition_id WHERE d.key='9sig' AND v.lifecycle_status='PUBLISHED' LIMIT 1"
    );
    expect(rows[0]?.config).toMatchObject({targetExposure:"NASDAQ_100_3X_LONG",targetRate:"0.09",contributionTargetRatio:"0.50"});
  });

  it("seeded plan entitlements are objects with a feature list",async()=>{
    const rows=await sql!.unsafe("SELECT slug,entitlements FROM plans WHERE slug IN ('free','investor','pro')");
    expect(rows).toHaveLength(3);
    for(const row of rows)expect(Array.isArray((row.entitlements as {features?:unknown}).features),String(row.slug)).toBe(true);
  });
});
