import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "@/lib/db";
import { assertSameOrigin, clientIp, consumeRateLimit, hashToken } from "@/lib/security";

const schema = z.object({ token: z.string().min(20), password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const tokenHash=hashToken(input.token);
    await consumeRateLimit("reset-confirm-ip:" + clientIp(request), 12, 3600);
    const hash = await bcrypt.hash(input.password, 12);
    const changed=await sql.begin(async (tx) => {
      const rows = await tx.unsafe(
        "SELECT id,user_id FROM auth_tokens WHERE token_hash=$1 AND type='RESET_PASSWORD' AND used_at IS NULL AND expires_at>now() LIMIT 1 FOR UPDATE",
        [tokenHash]
      );
      if(!rows[0])return false;
      await tx.unsafe("UPDATE users SET password_hash=$1,auth_version=auth_version+1,updated_at=now() WHERE id=$2", [hash, rows[0].user_id]);
      await tx.unsafe("UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND type='RESET_PASSWORD' AND used_at IS NULL", [rows[0].user_id]);
      return true;
    });
    if(!changed)return Response.json({ error: "Token is invalid or expired." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Choose a password of at least 12 characters." }, { status: 400 });
    if(error instanceof Error&&error.message==="RATE_LIMITED")return Response.json({error:"Too many attempts."},{status:429});
    return Response.json({ error: "Could not reset password." }, { status: 500 });
  }
}
