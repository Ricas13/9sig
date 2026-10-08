import { afterAll,describe,expect,it } from "vitest";
import { sql } from "@/lib/db";

// Regression: drizzle's postgres-js adapter used to turn the client's timestamp serializers into
// pass-through functions, so any Date bound as a parameter crashed the driver. This broke the
// Stripe webhook, action calculation, contributions and cash events.
describe.skipIf(!process.env.DATABASE_URL)("Date query parameters",()=>{
  afterAll(async()=>{await sql.end();});

  it("accepts a Date next to untyped string parameters",async()=>{
    const at=new Date("2030-01-02T03:04:05.000Z");
    const rows=await sql.unsafe("SELECT $1::text AS label, $2::timestamptz AS at",["x",at]);
    expect(new Date(String(rows[0].at)).toISOString()).toBe(at.toISOString());
  });

  it("accepts a Date as the only parameter",async()=>{
    const at=new Date("2030-01-02T03:04:05.000Z");
    const rows=await sql.unsafe("SELECT $1::timestamptz AS at",[at]);
    expect(new Date(String(rows[0].at)).toISOString()).toBe(at.toISOString());
  });

  it("still accepts timestamps passed as text and nulls",async()=>{
    const rows=await sql.unsafe("SELECT $1::timestamptz AS at, $2::timestamptz AS none",["2030-01-02T03:04:05Z",null]);
    expect(new Date(String(rows[0].at)).toISOString()).toBe("2030-01-02T03:04:05.000Z");
    expect(rows[0].none).toBeNull();
  });
});
