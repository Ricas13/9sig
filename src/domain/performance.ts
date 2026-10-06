import Decimal from "decimal.js";

export type CashFlow = { at: Date; amount: Decimal.Value };

export function timeWeightedReturn(periods: Array<{ startValue: Decimal.Value; endValue: Decimal.Value; netFlow: Decimal.Value }>) {
  return periods.reduce((growth, p) => {
    const start = new Decimal(p.startValue);
    if (start.eq(0)) return growth;
    const periodGrowth = new Decimal(p.endValue).minus(p.netFlow).div(start);
    return growth.mul(periodGrowth);
  }, new Decimal(1)).minus(1);
}

export function xirr(cashFlows: CashFlow[], guess = 0.1) {
  if (cashFlows.length < 2) throw new Error("XIRR requires at least two cash flows");
  const hasPositive = cashFlows.some((f) => new Decimal(f.amount).gt(0));
  const hasNegative = cashFlows.some((f) => new Decimal(f.amount).lt(0));
  if (!hasPositive || !hasNegative) throw new Error("XIRR requires positive and negative cash flows");

  const base = cashFlows[0].at.getTime();
  let rate = new Decimal(guess);
  for (let i = 0; i < 100; i++) {
    let value = new Decimal(0);
    let derivative = new Decimal(0);
    for (const flow of cashFlows) {
      const years = new Decimal(flow.at.getTime() - base).div(365.25 * 24 * 60 * 60 * 1000);
      const onePlus = new Decimal(1).plus(rate);
      const amount = new Decimal(flow.amount);
      value = value.plus(amount.div(onePlus.pow(years)));
      derivative = derivative.minus(years.mul(amount).div(onePlus.pow(years.plus(1))));
    }
    if (derivative.abs().lt("1e-16")) break;
    const next = rate.minus(value.div(derivative));
    if (next.minus(rate).abs().lt("1e-12")) return next;
    rate = next;
    if (rate.lte("-0.999999")) rate = new Decimal("-0.999999");
  }
  return rate;
}
