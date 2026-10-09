import { exposureLeverage, resolveMapping, type MappingCandidate } from "../instruments";
import { getExposure } from "./exposures";

export type VerifiedCandidate = MappingCandidate & { ticker: string; exchange: string };
export type RequiredPosition = { economicExposure: string; leverage: string; direction: "LONG" };
export type MarketChoice = { country: string; wrapper: string; currency: string; broker?: string | null };
export type ResolvedPosition = RequiredPosition & { ticker: string; exchange: string; currency: string; tradingLineId: string };
export type MarketAssessment = {
  available: boolean;
  positions: ResolvedPosition[];
  missingExposures: string[];
  supportedMarkets: string[];
};

/** A source strategy's allocations or target are immutable; only its implementation's trading lines vary. */
export function requiredPositions(engine: string, config: Record<string, unknown>): RequiredPosition[] {
  const one = (exposure: unknown, explicitLeverage?: unknown): RequiredPosition | null => {
    if (typeof exposure !== "string" || !exposure.trim()) return null;
    return {
      economicExposure: exposure,
      leverage: exposureLeverage(exposure, explicitLeverage ?? getExposure(exposure)?.leverage),
      direction: "LONG"
    };
  };
  if (engine === "VALUE_TARGET") {
    const required = one(config.targetExposure, config.targetLeverage);
    return required ? [required] : [];
  }
  if (engine === "FIXED_ALLOCATION" && Array.isArray(config.allocations)) {
    return config.allocations.map((row: unknown) => {
      const a = row as { exposure?: unknown; leverage?: unknown };
      return one(a?.exposure, a?.leverage);
    }).filter((p): p is RequiredPosition => Boolean(p));
  }
  // Research-only momentum strategies cannot be launched without their full, versioned universe.
  if (engine === "MOMENTUM_ROTATION" && Array.isArray(config.riskAssets)) {
    const exposures = [...config.riskAssets, config.defensiveAsset];
    return exposures.map((exposure) => one(exposure)).filter((p): p is RequiredPosition => Boolean(p));
  }
  return [];
}

function resolvePositions(required: RequiredPosition[], candidates: VerifiedCandidate[], choice: MarketChoice, asOf: string) {
  const positions: ResolvedPosition[] = [];
  const missingExposures: string[] = [];
  for (const item of required) {
    const mapping = resolveMapping(candidates, {
      economicExposure: item.economicExposure, leverage: item.leverage, direction: item.direction,
      country: choice.country, wrapper: choice.wrapper, broker: choice.broker ?? null,
      preferredCurrency: choice.currency, asOf
    });
    if (!mapping) {
      missingExposures.push(item.economicExposure);
      continue;
    }
    const line = mapping as VerifiedCandidate;
    positions.push({
      ...item, ticker: line.ticker, exchange: line.exchange,
      currency: line.tradingLineCurrency, tradingLineId: line.tradingLineId
    });
  }
  return { positions, missingExposures };
}

/**
 * Only all-leg, exact, matching-leverage and matching-currency mappings count as a market.
 * A candidate or a partial strategy mapping is NEVER an equivalent.
 */
export function assessStrategyMarket(
  engine: string, config: Record<string, unknown>, candidates: VerifiedCandidate[],
  choice: MarketChoice, asOf: string
): MarketAssessment {
  // A missing or malformed risk/defensive leg must never be silently filtered out.
  // Otherwise the remaining mapped legs could incorrectly pass market eligibility.
  if (engine === "MOMENTUM_ROTATION" &&
      (!Array.isArray(config.riskAssets) || config.riskAssets.length === 0 ||
       config.riskAssets.some((asset) => typeof asset !== "string" || !asset.trim()) ||
       typeof config.defensiveAsset !== "string" || !config.defensiveAsset.trim() ||
       new Set([...config.riskAssets, config.defensiveAsset]).size !== config.riskAssets.length + 1)) {
    return { available: false, positions: [], missingExposures: ["Unverified strategy rules"], supportedMarkets: [] };
  }
  const required = requiredPositions(engine, config);
  if (!required.length || (engine === "FIXED_ALLOCATION" &&
      required.length !== (Array.isArray(config.allocations) ? config.allocations.length : 0))) {
    return { available: false, positions: [], missingExposures: ["Unverified strategy rules"], supportedMarkets: [] };
  }
  const selected = resolvePositions(required, candidates, choice, asOf);
  const supported = new Set<string>();
  const choices = new Map<string, MarketChoice>();
  for (const candidate of candidates) {
    // A single market may be broker-restricted. Never advertise it without a broker that
    // actually resolves the entire portfolio.
    const market: MarketChoice = {
      country: candidate.country, wrapper: candidate.wrapper,
      currency: candidate.tradingLineCurrency, broker: candidate.broker
    };
    choices.set([market.country,market.wrapper,market.currency,market.broker ?? ""].join("|"),market);
  }
  for (const market of choices.values()) {
    if (resolvePositions(required,candidates,market,asOf).missingExposures.length === 0) {
      supported.add(market.country + " / " + market.wrapper + " (" + market.currency +
        (market.broker ? ", " + market.broker : "") + ")");
    }
  }
  return {
    available: selected.missingExposures.length === 0,
    positions: selected.positions,
    missingExposures: selected.missingExposures,
    supportedMarkets: [...supported].sort()
  };
}

export class StrategyMarketUnavailableError extends Error {
  readonly code = "STRATEGY_MARKET_UNAVAILABLE";
  constructor(readonly assessment: MarketAssessment, readonly choice: MarketChoice) {
    super("Strategy cannot be used in " + choice.country + " / " + choice.wrapper + " (" + choice.currency +
      "). " + (assessment.supportedMarkets.length
        ? "Verified markets: " + assessment.supportedMarkets.join(", ") + "."
        : "No market has a fully verified instrument set yet.") +
      " Missing or ambiguous: " + assessment.missingExposures.join(", ") + ".");
  }
}
