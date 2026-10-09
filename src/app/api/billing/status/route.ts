import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { authFailure } from "@/lib/api-auth";

// What the app polls after a purchase while the store's notification travels to the server.
export async function GET() {
  try {
    const user = await requireUser();
    const rows = await sql.unsafe(
      "SELECT p.slug,p.display_name,s.status,s.cadence,s.source,s.current_period_end,s.cancel_at_period_end FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1",
      [user.id]
    );
    const row = rows[0];
    return Response.json({
      plan: row ? { slug: String(row.slug), name: String(row.display_name) } : null,
      status: row ? String(row.status) : "FREE",
      cadence: row ? String(row.cadence) : "FREE",
      billedBy: row ? String(row.source) : "STRIPE",
      currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end).toISOString() : null,
      cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end)
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    return Response.json({ error: "Could not load billing status." }, { status: 500 });
  }
}
