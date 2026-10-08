import { z } from "zod";
import { requireUser } from "@/lib/session";
import { assertSameOrigin, consumeRateLimit } from "@/lib/security";
import { authFailure } from "@/lib/api-auth";
import { confirmEnrollment } from "@/lib/mfa";

const schema = z.object({ code: z.string().min(6).max(12) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await consumeRateLimit("mfa-enable:" + user.id, 10, 15 * 60);
    const input = schema.parse(await request.json());
    const recoveryCodes = await confirmEnrollment(user.id, input.code);
    // Shown once; only hashes are stored.
    return Response.json({ ok: true, recoveryCodes }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    const code = error instanceof Error ? error.message : "";
    if (error instanceof z.ZodError || code === "MFA_CODE_INVALID") return Response.json({ error: "That code is not valid. Check the code in your authenticator app and try again." }, { status: 400 });
    if (code === "RATE_LIMITED") return Response.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
    if (code === "MFA_ALREADY_ENABLED") return Response.json({ error: "Two-step sign-in is already on." }, { status: 409 });
    if (code === "MFA_NOT_STARTED") return Response.json({ error: "Start setup first." }, { status: 409 });
    return Response.json({ error: "Could not turn on two-step sign-in." }, { status: 500 });
  }
}
