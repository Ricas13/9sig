import { requireAdmin } from "@/lib/session";
import { assertSameOrigin, consumeRateLimit } from "@/lib/security";
import { authFailure } from "@/lib/api-auth";
import { keyStatus, reencryptAll } from "@/lib/key-rotation";
import { ensureSettings } from "@/lib/settings";

export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await keyStatus(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    return Response.json({ error: "Could not read the encryption status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    await consumeRateLimit("admin-reencrypt:" + admin.id, 6, 15 * 60);
    if (!process.env.APP_ENCRYPTION_KEY_PREVIOUS) {
      return Response.json({ error: "No previous key is set, so there is nothing to re-encrypt. Put the old key in APP_ENCRYPTION_KEY_PREVIOUS and restart first." }, { status: 409 });
    }
    const result = await reencryptAll(admin.id);
    await ensureSettings(true);
    return Response.json({ ok: true, ...result, status: await keyStatus() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    if (error instanceof Error && error.message === "RATE_LIMITED") return Response.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
    return Response.json({ error: "Could not re-encrypt." }, { status: 500 });
  }
}
