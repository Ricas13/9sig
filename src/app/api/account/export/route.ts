import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { authFailure } from "@/lib/api-auth";

// Everything the user owns, scoped by user_id or by their own strategy instances. Secrets are not
// exported: notification endpoints hold an encrypted webhook URL and are listed without it.
export async function GET() {
  try {
    const user = await requireUser();
    const instances = await sql.unsafe("SELECT * FROM strategy_instances WHERE user_id=$1 ORDER BY created_at", [user.id]);
    const ids = instances.map((x: any) => x.id);
    const byInstance = async (table: string, order: string) =>
      ids.length ? await sql.unsafe(`SELECT * FROM ${table} WHERE strategy_instance_id=ANY($1::uuid[]) ORDER BY ${order}`, [ids]) : [];
    const [ledger, actions, reconciliations, overrides, states, strategyAccounts] = await Promise.all([
      byInstance("ledger_events", "occurred_at"),
      byInstance("actions", "created_at"),
      byInstance("reconciliations", "occurred_at"),
      byInstance("overrides", "created_at"),
      byInstance("strategy_states", "calculated_at"),
      byInstance("strategy_accounts", "created_at")
    ]);
    const accounts = await sql.unsafe("SELECT * FROM accounts WHERE user_id=$1 ORDER BY created_at", [user.id]);
    const notifications = await sql.unsafe("SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at", [user.id]);
    const notificationEndpoints = await sql.unsafe("SELECT id,channel,enabled,created_at,updated_at FROM notification_endpoints WHERE user_id=$1 ORDER BY created_at", [user.id]);
    const signInMethods = await sql.unsafe("SELECT provider,email,created_at FROM oauth_accounts WHERE user_id=$1 ORDER BY created_at", [user.id]);
    return Response.json({
      exportedAt: new Date().toISOString(),
      user: { email: user.email, country: user.country, baseCurrency: user.baseCurrency, timezone: user.timezone, anonymousAggregateOptIn: user.anonymousAggregateOptIn },
      accounts, strategyInstances: instances, strategyAccounts, strategyStates: states,
      ledger, actions, reconciliations, overrides, notifications, notificationEndpoints, signInMethods
    });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    return Response.json({ error: "Could not export account." }, { status: 500 });
  }
}
