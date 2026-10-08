import { afterAll,beforeAll,describe,expect,it } from "vitest";
import postgres from "postgres";
import { recordSignIn } from "@/lib/sign-in-devices";

const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:2,prepare:false}):null;
const CHROME="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IOS="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe.skipIf(!url)("new-device sign-in alerts",()=>{
  const run=Math.random().toString(36).slice(2,10);
  let userId="";
  const notices=async()=>(await sql!.unsafe("SELECT metadata FROM audit_events WHERE actor_user_id=$1 AND action='security.notice' ORDER BY occurred_at",[userId])).map((r)=>r.metadata as {kind:string;sent:boolean});

  beforeAll(async()=>{
    process.env.EMAIL_PROVIDER="mock";
    const rows=await sql!.unsafe("INSERT INTO users (email,password_hash) VALUES ($1,'x') RETURNING id",[`dev-${run}@example.test`]);
    userId=String(rows[0].id);
  });
  afterAll(async()=>{
    if(!sql)return;
    await sql.unsafe("DELETE FROM audit_events WHERE actor_user_id=$1",[userId]);
    await sql.unsafe("DELETE FROM users WHERE id=$1",[userId]);
    await sql.end();
  });

  it("stays quiet on the very first sign-in and on a device it already knows",async()=>{
    expect(await recordSignIn(userId,CHROME)).toBe("first");
    expect(await recordSignIn(userId,CHROME.replace("126","131"))).toBe("known");
    expect(await notices()).toHaveLength(0);
  });

  it("emails the owner when an unseen browser or system signs in, once",async()=>{
    expect(await recordSignIn(userId,SAFARI_IOS)).toBe("new");
    expect(await recordSignIn(userId,SAFARI_IOS)).toBe("known");
    const sent=await notices();
    expect(sent).toEqual([{kind:"NEW_DEVICE_SIGN_IN",sent:true}]);
  });

  it("keeps only coarse labels, never the user agent or an address",async()=>{
    const rows=await sql!.unsafe("SELECT * FROM sign_in_devices WHERE user_id=$1 ORDER BY first_seen_at",[userId]);
    expect(rows.map((r)=>r.label)).toEqual(["Chrome on Windows","Safari on iOS"]);
    expect(JSON.stringify(rows)).not.toMatch(/AppleWebKit|Mozilla/);
  });

  it("never throws into the sign-in path",async()=>{
    expect(await recordSignIn("not-a-uuid",CHROME)).toBe("error");
  });

  it("caps how many devices are remembered",async()=>{
    for(let i=0;i<30;i++){
      await sql!.unsafe("INSERT INTO sign_in_devices (user_id,device_key,label,last_seen_at) VALUES ($1,$2,'x',now()-($3::int*interval '1 minute')) ON CONFLICT DO NOTHING",[userId,"k"+i,i]);
    }
    await recordSignIn(userId,"Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0");
    const n=(await sql!.unsafe("SELECT count(*)::int AS n FROM sign_in_devices WHERE user_id=$1",[userId]))[0].n;
    expect(n).toBeLessThanOrEqual(25);
  });
});
