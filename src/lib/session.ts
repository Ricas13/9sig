import "server-only";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const rows = await sql.unsafe(
    "SELECT id,email,country,base_currency,timezone,role,anonymous_aggregate_opt_in,auth_version FROM users WHERE id=$1 AND deleted_at IS NULL LIMIT 1",
    [session.user.id]
  );
  if (!rows[0]) throw new Error("UNAUTHENTICATED");
  if (Number(session.user.authVersion) !== Number(rows[0].auth_version)) throw new Error("SESSION_REVOKED");
  return {
    id: String(rows[0].id),
    email: String(rows[0].email),
    country: String(rows[0].country),
    baseCurrency: String(rows[0].base_currency),
    timezone: String(rows[0].timezone),
    role: String(rows[0].role),
    anonymousAggregateOptIn: Boolean(rows[0].anonymous_aggregate_opt_in)
  };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}
