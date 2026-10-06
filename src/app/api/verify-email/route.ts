import { sql } from "@/lib/db";
import { assertSameOrigin, hashToken } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return Response.json({error:"Invalid token."},{status:400});
    const hash = hashToken(token);
    const verified = await sql.begin(async (tx) => {
      const rows = await tx.unsafe(
        "SELECT id,user_id FROM auth_tokens WHERE token_hash=$1 AND type='VERIFY_EMAIL' AND used_at IS NULL AND expires_at>now() LIMIT 1 FOR UPDATE",
        [hash]
      );
      if (!rows[0]) return false;
      await tx.unsafe("UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()),updated_at=now() WHERE id=$1",[rows[0].user_id]);
      await tx.unsafe("UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND type='VERIFY_EMAIL' AND used_at IS NULL",[rows[0].user_id]);
      return true;
    });
    if (!verified) return Response.json({error:"Token is invalid or expired."},{status:400});
    return Response.json({ok:true});
  } catch {
    return Response.json({error:"Could not verify email."},{status:500});
  }
}
