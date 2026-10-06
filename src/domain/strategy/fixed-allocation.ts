import Decimal from "decimal.js";
import type { EngineContext, ProposedAction, StrategyEngine } from "./types";

type Allocation = { exposure: string; weight: string | number };

function money(v: Decimal) {
  return v.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2);
}

export const fixedAllocationEngine: StrategyEngine = {
  key: "FIXED_ALLOCATION",
  validateConfig(config) {
    const allocations = (config.allocations ?? []) as Allocation[];
    if (!Array.isArray(allocations) || allocations.length < 2) throw new Error("FIXED_ALLOCATION_REQUIRES_ALLOCATIONS");
    const seen = new Set<string>();
    let total = new Decimal(0);
    for (const allocation of allocations) {
      const exposure = String(allocation.exposure ?? "").trim();
      const weight = new Decimal(String(allocation.weight ?? ""));
      if (!exposure || seen.has(exposure) || !weight.isFinite() || weight.lte(0) || weight.gt(1)) throw new Error("INVALID_FIXED_ALLOCATION_CONFIG");
      seen.add(exposure);
      total = total.plus(weight);
    }
    if (total.minus(1).abs().gt("0.00000001")) throw new Error("FIXED_ALLOCATION_WEIGHTS_MUST_SUM_TO_ONE");
    const threshold = new Decimal(String(config.rebalanceThreshold ?? "0.05"));
    if (!threshold.isFinite() || threshold.lt(0) || threshold.gt(1)) throw new Error("INVALID_FIXED_ALLOCATION_THRESHOLD");
    const frequency = String(config.reviewFrequency ?? "QUARTERLY");
    if (!["MONTHLY","QUARTERLY","ANNUAL"].includes(frequency)) throw new Error("INVALID_FIXED_ALLOCATION_REVIEW_FREQUENCY");
  },
  calculate(ctx: EngineContext): ProposedAction {
    if (ctx.dataHealth.status !== "CURRENT") {
      return {
        actionType: "DATA_REQUIRED",
        title: "Data needs attention",
        instruction: ctx.dataHealth.message ?? "Current source data is not reliable enough to calculate a rebalance.",
        explanation: [{ label: "Data status", value: ctx.dataHealth.status }],
        nextState: ctx.state,
        confidence: "LOW",
        dueAt: ctx.nextReviewAt
      };
    }
    if (!ctx.reviewDue) {
      return {
        actionType: "NO_ACTION",
        title: "Everything is on track",
        instruction: "No allocation review is due yet.",
        explanation: [],
        nextState: ctx.state,
        confidence: "HIGH",
        dueAt: ctx.nextReviewAt
      };
    }

    const allocations = (ctx.config.allocations ?? []) as Allocation[];
    const threshold = new Decimal(String(ctx.config.rebalanceThreshold ?? "0.05"));
    const invested = ctx.exposures.reduce((sum, p) => sum.plus(p.value), new Decimal(0));
    const total = invested.plus(ctx.cash);
    if (total.lte(0) || !allocations.length) {
      return {
        actionType: "DATA_REQUIRED",
        title: "Portfolio data is incomplete",
        instruction: "Add holdings or reconcile the account before calculating a rebalance.",
        explanation: [],
        nextState: ctx.state,
        confidence: "LOW",
        dueAt: ctx.now
      };
    }

    const rows = allocations.map((a) => {
      const current = ctx.exposures.find((p) => p.economicExposure === a.exposure)?.value ?? new Decimal(0);
      const target = total.mul(new Decimal(String(a.weight)));
      return { exposure: a.exposure, current, target, delta: target.minus(current) };
    });
    const worst = [...rows].sort((a,b) => b.delta.abs().cmp(a.delta.abs()))[0];
    const drift = worst.delta.abs().div(total);

    const explanation = rows.map((r) => ({
      label: r.exposure,
      value: "current " + money(r.current) + " · target " + money(r.target) + " · delta " + money(r.delta),
      kind: "text" as const
    }));

    if (drift.lte(threshold)) {
      return {
        actionType: "HOLD",
        title: "No rebalance required",
        instruction: "All configured exposures are within the strategy rebalance threshold.",
        explanation,
        nextState: { ...ctx.state, lastCalculatedAt: ctx.now.toISOString() },
        confidence: "HIGH",
        dueAt: ctx.now
      };
    }

    return {
      actionType: "REBALANCE",
      title: "Rebalance required",
      instruction: "Under the strategy rules you selected, adjust the portfolio toward the target allocations shown below.",
      amount: worst.delta.abs(),
      currency: ctx.baseCurrency,
      economicExposure: worst.exposure,
      explanation,
      nextState: { ...ctx.state, lastCalculatedAt: ctx.now.toISOString() },
      confidence: "HIGH",
      dueAt: ctx.now
    };
  }
};
