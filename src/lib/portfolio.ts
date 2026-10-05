import "server-only";
import { sql } from "@/lib/db";
import { getQuoteSafe } from "@/lib/market";

export type Portfolio = {
  id: string;
  userId: string;
  setupComplete: boolean;
  currency: string;
  growthSymbol: string;
  reserveSymbol: string;
  qqqSymbol: string;
  startDate: string | null;
  startingCapital: number | null;
  monthlyContribution: number | null;
  growthStartRatio: number;
  quarterlyTarget: number;
  contributionTargetRatio: number;
  buyThrottle: number;
  signalAnchor: string;
  currentSignalBase: number | null;
  signalReferencePrice: number | null;
  lastSignalAt: string | null;
  thirtyDownActive: boolean;
  thirtyDownSkippedSells: number;
  thirtyDownStartedAt: string | null;
  manualGrowthPrice: number | null;
  manualReservePrice: number | null;
};

function num(value: unknown) { return value == null ? null : Number(value); }

export async function getUser(email: string) {
  const [row] = await sql`
    SELECT id, email, subscription_status, stripe_customer_id
    FROM users WHERE lower(email) = lower(${email}) LIMIT 1
  `;
  return row ? {
    id: row.id as string,
    email: row.email as string,
    subscriptionStatus: row.subscription_status as string,
    stripeCustomerId: row.stripe_customer_id as string | null,
  } : null;
}

export async function ensurePortfolio(userId: string) {
  await sql`INSERT INTO portfolios (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;
  return getPortfolio(userId);
}

export async function getPortfolio(userId: string): Promise<Portfolio> {
  const [r] = await sql`
    SELECT id, user_id, setup_complete, currency, growth_symbol, reserve_symbol, qqq_symbol,
      start_date, starting_capital, monthly_contribution, growth_start_ratio, quarterly_target,
      contribution_target_ratio, buy_throttle, signal_anchor, current_signal_base,
      signal_reference_price, last_signal_at, thirty_down_active, thirty_down_skipped_sells,
      thirty_down_started_at, manual_growth_price, manual_reserve_price
    FROM portfolios WHERE user_id = ${userId} LIMIT 1
  `;
  if (!r) throw new Error("Portfolio not found");
  return {
    id: r.id as string,
    userId: r.user_id as string,
    setupComplete: Boolean(r.setup_complete),
    currency: r.currency as string,
    growthSymbol: r.growth_symbol as string,
    reserveSymbol: r.reserve_symbol as string,
    qqqSymbol: r.qqq_symbol as string,
    startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
    startingCapital: num(r.starting_capital),
    monthlyContribution: num(r.monthly_contribution),
    growthStartRatio: Number(r.growth_start_ratio),
    quarterlyTarget: Number(r.quarterly_target),
    contributionTargetRatio: Number(r.contribution_target_ratio),
    buyThrottle: Number(r.buy_throttle),
    signalAnchor: String(r.signal_anchor).slice(0, 10),
    currentSignalBase: num(r.current_signal_base),
    signalReferencePrice: num(r.signal_reference_price),
    lastSignalAt: r.last_signal_at ? String(r.last_signal_at).slice(0, 10) : null,
    thirtyDownActive: Boolean(r.thirty_down_active),
    thirtyDownSkippedSells: Number(r.thirty_down_skipped_sells),
    thirtyDownStartedAt: r.thirty_down_started_at ? String(r.thirty_down_started_at).slice(0, 10) : null,
    manualGrowthPrice: num(r.manual_growth_price),
    manualReservePrice: num(r.manual_reserve_price),
  };
}

export async function currentHoldings(portfolio: Portfolio, throughDate: string) {
  const [recon] = await sql`
    SELECT occurred_at, created_at, growth_units, reserve_units
    FROM reconciliations
    WHERE portfolio_id = ${portfolio.id} AND occurred_at <= ${throughDate}
    ORDER BY occurred_at DESC, created_at DESC LIMIT 1
  `;
  const baseDate = recon?.occurred_at ? String(recon.occurred_at).slice(0, 10) : "1900-01-01";
  const baseCreated = recon?.created_at ?? new Date("1900-01-01T00:00:00Z");
  const baseGrowth = recon ? Number(recon.growth_units) : 0;
  const baseReserve = recon ? Number(recon.reserve_units) : 0;
  const [delta] = await sql`
    SELECT COALESCE(SUM(growth_units_delta),0) AS growth,
           COALESCE(SUM(reserve_units_delta),0) AS reserve
    FROM transactions
    WHERE portfolio_id = ${portfolio.id}
      AND occurred_at <= ${throughDate}
      AND (occurred_at > ${baseDate} OR (occurred_at = ${baseDate} AND created_at > ${baseCreated}))
  `;
  return {
    growthUnits: baseGrowth + Number(delta.growth),
    reserveUnits: baseReserve + Number(delta.reserve),
    reconciliationDate: recon ? baseDate : null,
  };
}

export async function currentPrices(portfolio: Portfolio) {
  const [growthAuto, reserveAuto] = await Promise.all([
    getQuoteSafe(portfolio.growthSymbol),
    getQuoteSafe(portfolio.reserveSymbol),
  ]);
  return {
    growth: portfolio.manualGrowthPrice ?? growthAuto?.price ?? null,
    reserve: portfolio.manualReservePrice ?? reserveAuto?.price ?? null,
    growthAsOf: portfolio.manualGrowthPrice ? "manual" : growthAuto?.asOf ?? null,
    reserveAsOf: portfolio.manualReservePrice ? "manual" : reserveAuto?.asOf ?? null,
  };
}

export async function recentTransactions(portfolioId: string, limit = 5) {
  const rows = await sql`
    SELECT occurred_at, event_type, action, contribution_amount, signal_target, note, metadata
    FROM transactions WHERE portfolio_id = ${portfolioId}
    ORDER BY occurred_at DESC, created_at DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({
    date: String(r.occurred_at).slice(0, 10),
    eventType: r.event_type as string,
    action: r.action as string,
    contributionAmount: Number(r.contribution_amount),
    signalTarget: r.signal_target == null ? null : Number(r.signal_target),
    note: r.note as string | null,
  }));
}
