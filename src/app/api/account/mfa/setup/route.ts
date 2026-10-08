import { requireUser } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { authFailure } from "@/lib/api-auth";
import { beginEnrollment } from "@/lib/mfa";
import { otpauthUri } from "@/domain/totp";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const secret = await beginEnrollment(user.id);
    const issuer = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Rebalune";
    return Response.json({ secret, otpauthUri: otpauthUri(secret, user.email, issuer) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    if (error instanceof Error && error.message === "MFA_ALREADY_ENABLED") return Response.json({ error: "Two-step sign-in is already on." }, { status: 409 });
    if (error instanceof Error && error.message === "MFA_PASSWORD_REQUIRED") return Response.json({ error: "Set a password first (use Forgot password on the sign-in page), then turn on two-step sign-in." }, { status: 409 });
    return Response.json({ error: "Could not start two-step sign-in setup." }, { status: 500 });
  }
}
