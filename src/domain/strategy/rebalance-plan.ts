import Decimal from "decimal.js";

export type PlanRow = { exposure: string; current: Decimal; weight: Decimal };
export type PlanLeg = { side: "SELL" | "BUY"; exposure: string; amount: Decimal };

const cents = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);

/**
 * Full rebalance as ordered legs: every sale first (largest first), then every purchase (largest
 * first), so the buys are always funded by sale proceeds plus cash. Targets are weight × (invested +
 * cash). Amounts are rounded to cents; the final purchase absorbs the rounding residue so that
 * buys − sells equals the cash spent exactly. Returns no legs when the largest drift is within
 * `threshold` (a fraction of the total).
 */
export function planRebalance(input: { rows: PlanRow[]; cash: Decimal; threshold: Decimal }): PlanLeg[] {
  const { rows, cash, threshold } = input;
  const invested = rows.reduce((sum, row) => sum.plus(row.current), new Decimal(0));
  const total = invested.plus(cash);
  if (total.lte(0)) return [];
  const deltas = rows.map((row) => ({ exposure: row.exposure, delta: total.mul(row.weight).minus(row.current) }));
  const worst = deltas.reduce((max, row) => Decimal.max(max, row.delta.abs()), new Decimal(0));
  if (worst.div(total).lte(threshold)) return [];

  const sells = deltas.filter((row) => cents(row.delta).lt(0)).sort((a, b) => a.delta.cmp(b.delta))
    .map((row): PlanLeg => ({ side: "SELL", exposure: row.exposure, amount: cents(row.delta.abs()) }));
  const buys = deltas.filter((row) => cents(row.delta).gt(0)).sort((a, b) => b.delta.cmp(a.delta))
    .map((row): PlanLeg => ({ side: "BUY", exposure: row.exposure, amount: cents(row.delta) }));

  const sold = sells.reduce((sum, leg) => sum.plus(leg.amount), new Decimal(0));
  const bought = buys.reduce((sum, leg) => sum.plus(leg.amount), new Decimal(0));
  const residue = sold.plus(cents(cash)).minus(bought);
  if (buys.length && !residue.isZero()) {
    const last = buys[buys.length - 1];
    last.amount = last.amount.plus(residue);
  }
  return [...sells, ...buys];
}
