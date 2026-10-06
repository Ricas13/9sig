import { z } from "zod";
import { sql } from "@/lib/db";
import { assertSameOrigin, clientIp, consumeRateLimit, hashToken, newToken } from "@/lib/security";
import { getEmailProvider } from "@/lib/email";

const schema = z.object({email:z.string().email()});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const email=input.email.toLowerCase();
    await Promise.all([
      consumeRateLimit("reset-ip:" + clientIp(request), 8, 3600),
      consumeRateLimit("reset-email:" + hashToken(email), 4, 3600)
    ]);
    const rows = await sql.unsafe("SELECT id,email FROM users WHERE email=$1 AND deleted_at IS NULL LIMIT 1",[email]);
    if (rows[0]) {
      const token = newToken();
      await sql.begin(async(tx)=>{
        await tx.unsafe("UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND type='RESET_PASSWORD' AND used_at IS NULL",[rows[0].id]);
        await tx.unsafe("INSERT INTO auth_tokens (user_id,type,token_hash,expires_at) VALUES ($1,'RESET_PASSWORD',$2,now()+interval '30 minutes')",[rows[0].id,hashToken(token)]);
      });
      const url = (process.env.NEXT_PUBLIC_APP_URL ?? "") + "/reset-password?token=" + encodeURIComponent(token);
      await getEmailProvider().send({to:String(rows[0].email),subject:"Reset your password",text:"Reset your password: " + url});
    }
    return Response.json({ok:true});
  } catch {
    return Response.json({ok:true});
  }
}
