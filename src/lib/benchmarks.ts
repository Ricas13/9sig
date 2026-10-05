import "server-only";
import { sql } from "@/lib/db";
import { getHistory, PricePoint } from "@/lib/market";
import { Portfolio } from "@/lib/portfolio";
import { todayIso } from "@/lib/dates";

export type ChartPoint = { date: string; qqq: number; threeX: number; nineSig: number; contributed: number };

function mapSeries(points: PricePoint[]) { return new Map(points.map((p) => [p.date, p.price])); }
function previous(map: Map<string, number>, dates: string[], index: number) {
  for (let i = index; i >= 0; i -= 1) { const v = map.get(dates[i]); if (v != null) return v; }
  return null;
}

export async function comparisonSeries(portfolio: Portfolio): Promise<ChartPoint[]> {
  if (!portfolio.setupComplete || !portfolio.startDate || portfolio.startingCapital == null) return [];
  const end = todayIso();
  try {
    const [growth, reserve, qqqUsd, fx] = await Promise.all([
      getHistory(portfolio.growthSymbol, portfolio.startDate, end),
      getHistory(portfolio.reserveSymbol, portfolio.startDate, end),
      getHistory("QQQ", portfolio.startDate, end),
      getHistory("GBPUSD=X", portfolio.startDate, end),
    ]);
    if (!growth.length || !reserve.length || !qqqUsd.length) return [];

    const growthMap = mapSeries(growth), reserveMap = mapSeries(reserve), qqqMapUsd = mapSeries(qqqUsd), fxMap = mapSeries(fx);
    const dates = growth.map((p) => p.date).filter((d) => d >= portfolio.startDate! && d <= end);
    if (!dates.length) return [];

    const txs = await sql`
      SELECT occurred_at, created_at, event_type, contribution_amount, growth_units_delta, reserve_units_delta
      FROM transactions WHERE portfolio_id = ${portfolio.id} ORDER BY occurred_at, created_at
    `;
    const recs = await sql`
      SELECT occurred_at, created_at, growth_units, reserve_units
      FROM reconciliations WHERE portfolio_id = ${portfolio.id} ORDER BY occurred_at, created_at
    `;
    const events: Array<{ date: string; createdAt: number; kind: "tx" | "rec"; row: any }> = [];
    for (const tx of txs) events.push({ date: String(tx.occurred_at).slice(0, 10), createdAt: new Date(tx.created_at as string).getTime(), kind: "tx", row: tx });
    for (const rec of recs) events.push({ date: String(rec.occurred_at).slice(0, 10), createdAt: new Date(rec.created_at as string).getTime(), kind: "rec", row: rec });
    events.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

    let sigGrowthUnits = 0, sigReserveUnits = 0;
    let qqqShares = 0, threeShares = 0, contributed = portfolio.startingCapital;
    let initialized = false, eventIndex = 0;
    const output: ChartPoint[] = [];

    for (let i = 0; i < dates.length; i += 1) {
      const d = dates[i];
      const g = growthMap.get(d) ?? previous(growthMap, dates, i);
      const r = reserveMap.get(d) ?? previous(reserveMap, dates, i);
      const qUsd = qqqMapUsd.get(d) ?? previous(qqqMapUsd, dates, i);
      const fxRate = fxMap.get(d) ?? previous(fxMap, dates, i);
      if (g == null || r == null || qUsd == null) continue;
      const qGbp = fxRate ? qUsd / fxRate : qUsd;

      if (!initialized) {
        qqqShares = portfolio.startingCapital / qGbp;
        threeShares = portfolio.startingCapital / g;
        initialized = true;
      }

      while (eventIndex < events.length && events[eventIndex].date <= d) {
        const event = events[eventIndex];
        if (event.kind === "rec") {
          sigGrowthUnits = Number(event.row.growth_units);
          sigReserveUnits = Number(event.row.reserve_units);
        } else {
          sigGrowthUnits += Number(event.row.growth_units_delta);
          sigReserveUnits += Number(event.row.reserve_units_delta);
          const contribution = Number(event.row.contribution_amount);
          if (contribution > 0) {
            contributed += contribution;
            qqqShares += contribution / qGbp;
            threeShares += contribution / g;
          }
        }
        eventIndex += 1;
      }

      if (i % 5 === 0 || i === dates.length - 1) {
        output.push({ date: d, qqq: qqqShares * qGbp, threeX: threeShares * g, nineSig: sigGrowthUnits * g + sigReserveUnits * r, contributed });
      }
    }
    return output;
  } catch {
    return [];
  }
}
