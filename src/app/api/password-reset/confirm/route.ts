import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "@/lib/db";
import { assertSameOrigin, consumeRateLimit, hashToken } from "@/lib/security";

const schema = z.object({ token: z.string().min(20), password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await consumeRateLimit("reset-confirm:" + ip, 10, 3600);
    const input = schema.parse(await request.json());
    const hash = await bcrypt.hash(input.password, 12);
    const reset = await sql.begin(async (tx) => {
      // Consuming the token is the check: concurrent attempts with the same token cannot both win.
      const consumed = await tx.unsafe(
        "UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND type='RESET_PASSWORD' AND used_at IS NULL AND expires_at>now() RETURNING user_id",
        [hashToken(input.token)]
      );
      if (!consumed[0]) return false;
      await tx.unsafe("UPDATE users SET password_hash=$1,session_version=session_version+1,updated_at=now() WHERE id=$2 AND deleted_at IS NULL", [hash, consumed[0].user_id]);
      await tx.unsafe("UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND type='RESET_PASSWORD' AND used_at IS NULL", [consumed[0].user_id]);
      return true;
    });
    if (!reset) return Response.json({ error: "Token is invalid or expired." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Choose a password of at least 12 characters." }, { status: 400 });
    if (error instanceof Error && error.message === "RATE_LIMITED") return Response.json({ error: "Too many attempts." }, { status: 429 });
    return Response.json({ error: "Could not reset password." }, { status: 500 });
  }
}
