import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { ensureSettings } from "@/lib/settings";

export async function requireUser() {
  await ensureSettings();
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const rows = await sql.unsafe(
    "SELECT id,email,country,base_currency,timezone,role,anonymous_aggregate_opt_in,session_version FROM users WHERE id=$1 AND deleted_at IS NULL LIMIT 1",
    [session.user.id]
  );
  if (!rows[0]) throw new Error("UNAUTHENTICATED");
  // A password reset bumps the stored version, which invalidates every older session.
  if (Number(rows[0].session_version ?? 0) !== session.user.sessionVersion) throw new Error("UNAUTHENTICATED");
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
  // When the operator requires it, an admin without two-step sign-in is kept out of the control
  // plane (but not out of their own account, where they can turn it on, so nobody is locked out).
  if (process.env.ADMIN_MFA_REQUIRED === "true") {
    const rows = await sql.unsafe("SELECT mfa_enabled_at FROM users WHERE id=$1", [user.id]);
    if (!rows[0]?.mfa_enabled_at) throw new Error("MFA_REQUIRED");
  }
  return user;
}

// For server-rendered pages and layouts: a missing, deleted or revoked session (for example
// after a password reset on another device) sends the user to sign in instead of an error page.
export async function requirePageUser() {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login");
    throw error;
  }
}
