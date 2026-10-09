import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import postgres from "postgres";
import crypto from "node:crypto";

type SessionUser={id:string;email:string;country:string;baseCurrency:string;timezone:string;role:string;anonymousAggregateOptIn:boolean};
const session=vi.hoisted(()=>({user:null as SessionUser|null}));
vi.mock("@/lib/session",()=>({
  requireUser:async()=>{if(!session.user)throw new Error("UNAUTHENTICATED");return session.user;},
  requireAdmin:async()=>{if(!session.user)throw new Error("UNAUTHENTICATED");if(session.user.role!=="ADMIN")throw new Error("FORBIDDEN");return session.user;},
  requirePageUser:async()=>{if(!session.user)throw new Error("UNAUTHENTICATED");return session.user;}
}));

const url=process.env.DATABASE_URL;
const sql=url?postgres(url,{max:2,prepare:false}):null;
const newKey=()=>crypto.randomBytes(32).toString("base64");
const ORIGIN="http://127.0.0.1:3000";

describe.skipIf(!url)("encryption key rotation",()=>{
  const run=Math.random().toString(36).slice(2,8);
  const oldKey=newKey(), freshKey=newKey();
  const saved:Record<string,string|undefined>={};
  let adminId="",userId="";

  beforeAll(async()=>{
    for(const k of ["APP_ENCRYPTION_KEY","APP_ENCRYPTION_KEY_PREVIOUS","NEXT_PUBLIC_APP_URL"])saved[k]=process.env[k];
    process.env.NEXT_PUBLIC_APP_URL=ORIGIN;
    process.env.APP_ENCRYPTION_KEY=oldKey;
    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
    const {encryptSecret}=await import("@/lib/crypto");
    const admin=await sql!.unsafe("INSERT INTO users (email,password_hash,role) VALUES ($1,'x','ADMIN') RETURNING id",[`rot-admin-${run}@example.test`]);
    adminId=String(admin[0].id);
    const user=await sql!.unsafe("INSERT INTO users (email,password_hash,mfa_secret_encrypted) VALUES ($1,'x',$2) RETURNING id",[`rot-user-${run}@example.test`,encryptSecret("MFASECRET"+run)]);
    userId=String(user[0].id);
    await sql!.unsafe("INSERT INTO notification_endpoints (user_id,channel,encrypted_destination,enabled) VALUES ($1,'DISCORD',$2,true)",[userId,encryptSecret("https://discord.com/api/webhooks/1/abc"+run)]);
    session.user={id:adminId,email:`rot-admin-${run}@example.test`,country:"GB",baseCurrency:"GBP",timezone:"Europe/London",role:"ADMIN",anonymousAggregateOptIn:false};
  });
  afterAll(async()=>{
    for(const k of Object.keys(saved)){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
    if(!sql)return;
    await sql.unsafe("DELETE FROM app_settings WHERE key='EMAIL_FROM'");
    await sql.unsafe("DELETE FROM audit_events WHERE actor_user_id=$1",[adminId]);
    await sql.unsafe("DELETE FROM rate_limits WHERE key LIKE $1",["%"+adminId+"%"]);
    await sql.unsafe("DELETE FROM users WHERE id=ANY($1::uuid[])",[[adminId,userId]]);
    await sql.end();
  });

  const post=async()=>{
    const {POST}=await import("@/app/api/admin/encryption/route");
    const r=await POST(new Request(ORIGIN+"/api/admin/encryption",{method:"POST",headers:{origin:ORIGIN}}));
    return {status:r.status,json:await r.json() as {error?:string;reencrypted?:number;status?:{onOldKey:number;unreadable:number}}};
  };

  const mine=async()=>{
    const user=await sql!.unsafe("SELECT mfa_secret_encrypted FROM users WHERE id=$1",[userId]);
    const hook=await sql!.unsafe("SELECT encrypted_destination FROM notification_endpoints WHERE user_id=$1",[userId]);
    return {mfa:String(user[0].mfa_secret_encrypted),hook:String(hook[0].encrypted_destination)};
  };

  it("starts with the values readable under the current key",async()=>{
    const {decryptSecretDetailed}=await import("@/lib/crypto");
    const {mfa}=await mine();
    expect(decryptSecretDetailed(mfa)).toEqual({plaintext:"MFASECRET"+run,usedPreviousKey:false});
  });

  it("after the key changes, values are unreadable until the old key is supplied as the previous key",async()=>{
    // A saved setting under the old key (written just before use: other files clear this table).
    const {encryptSecret:enc}=await import("@/lib/crypto");
    await sql!.unsafe("INSERT INTO app_settings (key,value_encrypted) VALUES ('EMAIL_FROM',$1) ON CONFLICT (key) DO UPDATE SET value_encrypted=EXCLUDED.value_encrypted",[enc("ops@example.test")]);
    process.env.APP_ENCRYPTION_KEY=freshKey;
    const {decryptSecretDetailed}=await import("@/lib/crypto");
    const {keyStatus}=await import("@/lib/key-rotation");
    const {mfa}=await mine();
    expect(()=>decryptSecretDetailed(mfa)).toThrow();
    process.env.APP_ENCRYPTION_KEY_PREVIOUS=oldKey;
    // Reading keeps working during the rotation, and the status counts them as still on the old key.
    expect(decryptSecretDetailed(mfa)).toEqual({plaintext:"MFASECRET"+run,usedPreviousKey:true});
    // Other test files clear the settings table at will, so count only the two rows this file owns.
    expect((await keyStatus()).onOldKey).toBeGreaterThanOrEqual(2);
  });

  it("refuses ordinary users",async()=>{
    session.user={...session.user!,role:"USER"};
    expect((await post()).status).toBe(403);
    session.user={...session.user,role:"ADMIN"};
  });

  it("re-encrypts everything with the new key and is audited",async()=>{
    const result=await post();
    expect(result.status).toBe(200);
    expect(result.json.reencrypted).toBeGreaterThanOrEqual(2);
    expect(result.json.status!.onOldKey).toBe(0);
    const audit=await sql!.unsafe("SELECT metadata FROM audit_events WHERE actor_user_id=$1 AND action='security.keys-reencrypted'",[adminId]);
    expect(audit.length).toBe(1);
  });

  it("keeps working after the old key is removed",async()=>{
    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
    const {decryptSecretDetailed}=await import("@/lib/crypto");
    const {mfa,hook}=await mine();
    expect(decryptSecretDetailed(mfa)).toEqual({plaintext:"MFASECRET"+run,usedPreviousKey:false});
    expect(decryptSecretDetailed(hook).plaintext).toContain("discord.com");
    // A saved setting written with the new key is read back correctly.
    const {encryptSecret}=await import("@/lib/crypto");
    const {ensureSettings}=await import("@/lib/settings");
    await sql!.unsafe("INSERT INTO app_settings (key,value_encrypted) VALUES ('EMAIL_FROM',$1) ON CONFLICT (key) DO UPDATE SET value_encrypted=EXCLUDED.value_encrypted",[encryptSecret("ops@example.test")]);
    delete process.env.EMAIL_FROM;
    await ensureSettings(true);
    expect(process.env.EMAIL_FROM).toBe("ops@example.test");
  });

  it("says there is nothing to do when no previous key is set",async()=>{
    const result=await post();
    expect(result.status).toBe(409);
    expect(result.json.error).toMatch(/previous key/i);
  });
});
