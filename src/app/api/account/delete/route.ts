import { requireUser } from "@/lib/session";
import { assertSameOrigin } from "@/lib/security";
import { authFailure } from "@/lib/api-auth";
import { beginAccountDeletion, finishAccountDeletion } from "@/lib/account-deletion";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const started = await beginAccountDeletion(user.id);
    if (started === "BILLING_NOT_CONFIGURED") {
      return Response.json({ error: "Billing must be disconnected before this account can be deleted." }, { status: 503 });
    }
    // The account is already closed to the user at this point. If Stripe or the purge cannot finish
    // right now, the hourly worker completes it, so report that honestly instead of failing.
    const outcome = await finishAccountDeletion(user.id);
    return Response.json({ ok: true, completed: outcome === "DELETED" }, { status: outcome === "DELETED" ? 200 : 202 });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    return Response.json({ error: "Could not delete account." }, { status: 500 });
  }
}
