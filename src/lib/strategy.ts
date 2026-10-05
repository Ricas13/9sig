import "server-only";
import { sql } from "@/lib/db";
import { addDays, addMonths, daysBetween, nextSignalAfter, signalDatesBack, signalOnOrBefore, todayIso } from "@/lib/dates";
import { getHistory, priceOnOrBefore } from "@/lib/market";
import { currentHoldings, currentPrices, Portfolio } from "@/lib/portfolio";

export type ActionType =
  | "SETUP"
  | "PRICE_REQUIRED"
  | "ADD_CONTRIBUTION"
  | "SPIKE_RESET"
  | "BUY"
  | "SELL"
  | "HOLD"
  | "SKIP_SELL"
  | "RESET"
  | "DO_NOTHING";

export type StrategyState = {
  asOf: string;
  action: ActionType;
  headline: string;
  instruction: string;
  actionAmount: number;
  growthPrice: number | null;
  reservePrice: number | null;
  growthPriceAsOf: string | null;
  reservePriceAsOf: string | null;
  growthUnits: number;
  reserveUnits: number;
  growthValue: number;
  reserveValue: number;
  totalValue: number;
  growthAllocation: number;
  nextContributionDate: string | null;
  nextSignalDate: string | null;
  nextTarget: number | null;
  thirtyDownActive: boolean;
  thirtyDownTriggeredNow: boolean;
  thirtyDownSkippedSells: number;
  thirtyDownThreshold: number | null;
  contributed: number;
  investmentGain: number;
  signalDue: boolean;
};

async function totalContributed(portfolio: Portfolio) {
  const [r] = await sql`
    SELECT COALESCE(SUM(contribution_amount),0) AS contributions
    FROM transactions WHERE portfolio_id = ${portfolio.id}
  `;
  return (portfolio.startingCapital ?? 0) + Number(r.contributions);
}

async function contributionsSince(portfolio: Portfolio, date: string) {
  const [r] = await sql`
    SELECT COALESCE(SUM(contribution_amount),0) AS amount
    FROM transactions
    WHERE portfolio_id = ${portfolio.id} AND occurred_at > ${date}
  `;
  return Number(r.amount);
}

async function lastContributionDate(portfolio: Portfolio) {
  const [r] = await sql`
    SELECT MAX(occurred_at) AS d FROM transactions
    WHERE portfolio_id = ${portfolio.id} AND event_type = 'CONTRIBUTION'
  `;
  return r?.d ? String(r.d).slice(0, 10) : null;
}

async function thirtyDownThreshold(portfolio: Portfolio, signalDate: string) {
  const back = signalDatesBack(addDays(signalDate, -1), portfolio.signalAnchor, 8);
  const start = addDays(back.at(-1) ?? signalDate, -14);
  try {
    const history = await getHistory(portfolio.growthSymbol, start, signalDate);
    const closes = back.map((d) => priceOnOrBefore(history, d)?.price).filter((x): x is number => Boolean(x));
    if (!closes.length) return null;
    return Math.max(...closes) * 0.70;
  } catch {
    return null;
  }
}

export async function buildStrategyState(portfolio: Portfolio, overrides?: { growthPrice?: number; reservePrice?: number }): Promise<StrategyState> {
  const today = todayIso();
  if (!portfolio.setupComplete || !portfolio.startDate || portfolio.startingCapital == null || portfolio.monthlyContribution == null) {
    return empty("SETUP", "Set up your 9Sig journey", "Enter your starting amount, monthly contribution and current holdings.", today);
  }

  const holdings = await currentHoldings(portfolio, today);
  const autoPrices = await currentPrices(portfolio);
  const growthPrice = overrides?.growthPrice ?? autoPrices.growth;
  const reservePrice = overrides?.reservePrice ?? autoPrices.reserve;
  const growthUnits = holdings.growthUnits;
  const reserveUnits = holdings.reserveUnits;
  const growthValue = growthPrice == null ? 0 : growthUnits * growthPrice;
  const reserveValue = reservePrice == null ? 0 : reserveUnits * reservePrice;
  const totalValue = growthValue + reserveValue;
  const growthAllocation = totalValue > 0 ? growthValue / totalValue : 0;
  const contributed = await totalContributed(portfolio);

  const lastContribution = await lastContributionDate(portfolio);
  const contributionBase = lastContribution ?? portfolio.startDate;
  const nextContributionDate = addMonths(contributionBase, 1);

  const baseSignalDate = portfolio.lastSignalAt ?? signalOnOrBefore(portfolio.startDate, portfolio.signalAnchor);
  const nextSignalDate = nextSignalAfter(baseSignalDate, portfolio.signalAnchor);
  const newContributions = await contributionsSince(portfolio, baseSignalDate);
  const nextTarget = (portfolio.currentSignalBase ?? growthValue) * (1 + portfolio.quarterlyTarget)
    + newContributions * portfolio.contributionTargetRatio;

  const signalDue = today >= nextSignalDate;
  const threshold = signalDue ? await thirtyDownThreshold(portfolio, nextSignalDate) : null;
  const triggeredNow = Boolean(signalDue && threshold != null && growthPrice != null && growthPrice <= threshold);
  const thirtyDown = portfolio.thirtyDownActive || triggeredNow;
  const phaseExpired = Boolean(portfolio.thirtyDownStartedAt && daysBetween(portfolio.thirtyDownStartedAt, nextSignalDate) >= 8 * 91);

  const common = {
    asOf: today,
    growthPrice,
    reservePrice,
    growthPriceAsOf: autoPrices.growthAsOf,
    reservePriceAsOf: autoPrices.reserveAsOf,
    growthUnits,
    reserveUnits,
    growthValue,
    reserveValue,
    totalValue,
    growthAllocation,
    nextContributionDate,
    nextSignalDate,
    nextTarget,
    thirtyDownActive: thirtyDown,
    thirtyDownTriggeredNow: triggeredNow,
    thirtyDownSkippedSells: portfolio.thirtyDownSkippedSells,
    thirtyDownThreshold: threshold,
    contributed,
    investmentGain: totalValue - contributed,
    signalDue,
  };

  if (growthPrice == null || reservePrice == null) {
    return { ...common, action: "PRICE_REQUIRED", headline: "Confirm today's prices", instruction: "Automatic market data is unavailable. Enter the 3QQQ and CSH2 prices before doing anything.", actionAmount: 0 };
  }
  if (signalDue) {
    const growthStale = autoPrices.growthAsOf !== "manual" && autoPrices.growthAsOf != null && autoPrices.growthAsOf < nextSignalDate;
    const reserveStale = autoPrices.reserveAsOf !== "manual" && autoPrices.reserveAsOf != null && autoPrices.reserveAsOf < nextSignalDate;
    if (growthStale || reserveStale) {
      return { ...common, action: "PRICE_REQUIRED", headline: "Waiting for signal-day prices", instruction: "The latest automatic quote is older than the signal date. Wait for the market close/data refresh, or enter the confirmed 3QQQ and CSH2 prices manually.", actionAmount: 0 };
    }
  }

  const spike = !thirtyDown && portfolio.signalReferencePrice != null
    && growthPrice >= portfolio.signalReferencePrice * 2
    && growthAllocation >= portfolio.growthStartRatio;
  if (spike) {
    const desiredGrowth = totalValue * portfolio.growthStartRatio;
    return { ...common, action: "SPIKE_RESET", headline: "Spike reset", instruction: resetText(desiredGrowth - growthValue), actionAmount: desiredGrowth - growthValue };
  }

  if (today >= nextContributionDate) {
    return { ...common, action: "ADD_CONTRIBUTION", headline: `Add £${money(portfolio.monthlyContribution)} to CSH2`, instruction: "Put the full monthly contribution into CSH2, then confirm it here.", actionAmount: portfolio.monthlyContribution };
  }

  if (signalDue) {
    const gap = nextTarget - growthValue;
    if (thirtyDown && phaseExpired) {
      const desired = totalValue * portfolio.growthStartRatio;
      return { ...common, action: "RESET", headline: "Reset to 60/40", instruction: "The 30-Down phase has reached its maximum length. Reset 3QQQ / CSH2 to 60 / 40.", actionAmount: desired - growthValue };
    }
    if (gap < 0 && thirtyDown) {
      if (portfolio.thirtyDownSkippedSells < 2) {
        return { ...common, action: "SKIP_SELL", headline: `Skip sell ${portfolio.thirtyDownSkippedSells + 1} of 2`, instruction: "30-Down is active. Do not sell 3QQQ this signal. Confirm the skipped signal.", actionAmount: 0 };
      }
      const desired = totalValue * portfolio.growthStartRatio;
      return { ...common, action: "RESET", headline: "Reset to 60/40", instruction: "Two sell signals were skipped. Reset the portfolio to 60% 3QQQ / 40% CSH2.", actionAmount: desired - growthValue };
    }
    if (gap > 0) {
      const buy = Math.min(gap, reserveValue * portfolio.buyThrottle);
      return { ...common, action: "BUY", headline: `Buy £${money(buy)} of 3QQQ`, instruction: `Move £${money(buy)} from CSH2 into 3QQQ, then confirm the trade.`, actionAmount: buy };
    }
    if (gap < 0) {
      const sell = Math.abs(gap);
      return { ...common, action: "SELL", headline: `Sell £${money(sell)} of 3QQQ`, instruction: `Move £${money(sell)} from 3QQQ into CSH2, then confirm the trade.`, actionAmount: -sell };
    }
    return { ...common, action: "HOLD", headline: "Hold", instruction: "The 3QQQ sleeve is on target. Confirm this signal with no trade.", actionAmount: 0 };
  }

  return { ...common, action: "DO_NOTHING", headline: "Do nothing", instruction: `Nothing is required. Your next contribution is ${nextContributionDate}; your next 9Sig signal is ${nextSignalDate}.`, actionAmount: 0 };
}

function empty(action: ActionType, headline: string, instruction: string, today: string): StrategyState {
  return {
    asOf: today, action, headline, instruction, actionAmount: 0,
    growthPrice: null, reservePrice: null, growthPriceAsOf: null, reservePriceAsOf: null,
    growthUnits: 0, reserveUnits: 0, growthValue: 0, reserveValue: 0, totalValue: 0, growthAllocation: 0,
    nextContributionDate: null, nextSignalDate: null, nextTarget: null,
    thirtyDownActive: false, thirtyDownTriggeredNow: false, thirtyDownSkippedSells: 0, thirtyDownThreshold: null,
    contributed: 0, investmentGain: 0, signalDue: false,
  };
}

function money(value: number) { return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function resetText(delta: number) {
  return delta >= 0
    ? `Move £${money(delta)} from CSH2 into 3QQQ to return to 60 / 40.`
    : `Move £${money(Math.abs(delta))} from 3QQQ into CSH2 to return to 60 / 40.`;
}
