import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "@/lib/db";
import { hashToken } from "@/lib/security";

const schema = z.object({ token: z.string().min(20), password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const rows = await sql.unsafe(
      "SELECT id,user_id FROM auth_tokens WHERE token_hash=$1 AND type='RESET_PASSWORD' AND used_at IS NULL AND expires_at>now() LIMIT 1",
      [hashToken(input.token)]
    );
    if (!rows[0]) return Response.json({ error: "Token is invalid or expired." }, { status: 400 });
    const hash = await bcrypt.hash(input.password, 12);
    await sql.begin(async (tx) => {
      await tx.unsafe("UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2", [hash, rows[0].user_id]);
      await tx.unsafe("UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND type='RESET_PASSWORD' AND used_at IS NULL", [rows[0].user_id]);
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Choose a password of at least 12 characters." }, { status: 400 });
    return Response.json({ error: "Could not reset password." }, { status: 500 });
  }
}
