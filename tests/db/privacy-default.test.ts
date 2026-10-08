import { afterAll,describe,expect,it } from "vitest";
import postgres from "postgres";

const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:1,prepare:false}):null;

describe.skipIf(!url)("privacy defaults",()=>{
  const email=`pd-${Math.random().toString(36).slice(2,10)}@example.test`;
  afterAll(async()=>{if(!sql)return;await sql.unsafe("DELETE FROM users WHERE email=$1",[email]);await sql.end();});

  it("a new account does not contribute to community statistics until it opts in",async()=>{
    const rows=await sql!.unsafe("INSERT INTO users (email,password_hash) VALUES ($1,'x') RETURNING anonymous_aggregate_opt_in",[email]);
    expect(rows[0].anonymous_aggregate_opt_in).toBe(false);
  });
});
