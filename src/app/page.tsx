import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Dashboard } from "@/components/Dashboard";
import { Paywall } from "@/components/Paywall";
import { SetupForm } from "@/components/SetupForm";
import { comparisonSeries } from "@/lib/benchmarks";
import { hasPaidAccess } from "@/lib/access";
import { sql } from "@/lib/db";
import { todayIso } from "@/lib/dates";
import { ensurePortfolio, getUser, recentTransactions } from "@/lib/portfolio";
import { buildStrategyState } from "@/lib/strategy";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const user = await getUser(session.user.email);
  if (!user) redirect("/login");
  const portfolio = await ensurePortfolio(user.id);
  const access = hasPaidAccess({ email: user.email, subscription_status: user.subscriptionStatus });
  const [discord] = await sql`SELECT discord_webhook_ciphertext IS NOT NULL AS enabled FROM users WHERE id=${user.id}`;

  async function logout() { "use server"; await signOut({ redirectTo: "/login" }); }

  return <main className="shell">
    <header className="topbar">
      <div><div className="brand">9Sig Journey</div><div className="muted" style={{ fontSize: 12 }}>{user.email}</div></div>
      <form action={logout}><button className="secondary" type="submit">Log out</button></form>
    </header>
    {!access ? <Paywall /> : !portfolio.setupComplete ? <SetupForm today={todayIso()} /> : <Dashboard
      state={await buildStrategyState(portfolio)}
      chart={await comparisonSeries(portfolio)}
      recent={await recentTransactions(portfolio.id, 5)}
      discordEnabled={Boolean(discord?.enabled)}
      billingEnabled={Boolean(user.stripeCustomerId)}
    />}
  </main>;
}