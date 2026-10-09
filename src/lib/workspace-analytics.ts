import "server-only";
import { sql } from "@/lib/db";
import { simulateSameCashFlows } from "@/domain/comparison";
import {
  aggregateAtCommonDates,growthIndex,rankOnCommonHistory,summarizeObservedPerformance,
  type DatedFlow,type StrategySeries,type Valuation
} from "@/domain/portfolio-analytics";

/** VTI, SPY and QQQ must be real licensed total-return series denominated in the account currency.
 * Untagged/admin-manual or USD-only data must not be presented as a GBP counterfactual.
 */
const BENCHMARKS=["vti","spy","qqq"] as const;
export type BenchmarkHistory = {key:string;label:string;currency:string;points:Valuation[]};
type BenchmarkRow={key:string;date:unknown;value:unknown;currency:unknown;return_basis:unknown};
type StrategyRow={id:unknown;name:unknown;currency:unknown;status:unknown};
type ValueRow={strategy_instance_id:unknown;date:unknown;value:unknown};
type FlowRow={strategy_instance_id:unknown;date:unknown;cash_amount:unknown};

export async function loadWorkspaceAnalytics(userId:string) {
  const [strategiesRaw,valuesRaw,flowsRaw,benchmarksRaw]=await Promise.all([
    sql.unsafe("SELECT i.id,i.name,i.status,a.currency FROM strategy_instances i JOIN accounts a ON a.id=i.account_id WHERE i.user_id=$1 AND i.status IN ('ACTIVE','PAUSED') ORDER BY i.created_at",[userId]),
    sql.unsafe("SELECT p.strategy_instance_id,p.date,p.value FROM performance_series p JOIN strategy_instances i ON i.id=p.strategy_instance_id WHERE i.user_id=$1 AND i.status IN ('ACTIVE','PAUSED') AND p.series_type='USER_VALUE' ORDER BY p.date",[userId]),
    sql.unsafe("SELECT l.strategy_instance_id,l.occurred_at::date AS date,l.cash_amount FROM ledger_events l JOIN strategy_instances i ON i.id=l.strategy_instance_id WHERE i.user_id=$1 AND i.status IN ('ACTIVE','PAUSED') AND l.event_type IN ('CONTRIBUTION','WITHDRAWAL') AND NOT EXISTS (SELECT 1 FROM ledger_events c WHERE c.correction_of_event_id=l.id) ORDER BY l.occurred_at",[userId]),
    sql.unsafe("SELECT lower(b.key) AS key,bp.date,bp.value,bp.metadata->>'currency' AS currency,bp.metadata->>'returnBasis' AS return_basis FROM benchmark_performance bp JOIN benchmarks b ON b.id=bp.benchmark_id WHERE lower(b.key) IN ('vti','spy','qqq') ORDER BY b.key,bp.date")
  ]);
  const strategyRows=strategiesRaw as unknown as StrategyRow[];
  const valueRows=valuesRaw as unknown as ValueRow[];
  const flowRows=flowsRaw as unknown as FlowRow[];
  const benchmarkRows=benchmarksRaw as unknown as BenchmarkRow[];
  const strategies:StrategySeries[]=strategyRows.map(s=>({
    id:String(s.id),name:String(s.name),currency:String(s.currency).toUpperCase(),
    valuations:valueRows.filter(v=>String(v.strategy_instance_id)===String(s.id)).map(v=>({date:String(v.date).slice(0,10),value:String(v.value)})),
    flows:flowRows.filter(v=>String(v.strategy_instance_id)===String(s.id)).map(v=>({date:String(v.date).slice(0,10),amount:String(v.cash_amount)}))
  }));
  const availableBenchmarks:BenchmarkHistory[]=[];
  for(const key of BENCHMARKS) {
    const rows=benchmarkRows.filter(r=>r.key===key);
    if(!rows.length || rows.some(row=>row.return_basis!=="TOTAL_RETURN"||!row.currency||
      String(row.currency).length!==3))continue;
    const currencies=new Set(rows.map(row=>String(row.currency).toUpperCase()));
    if(currencies.size!==1)continue;
    availableBenchmarks.push({key,label:key.toUpperCase(),currency:[...currencies][0],
      points:rows.map(row=>({date:String(row.date).slice(0,10),value:String(row.value)}))});
  }
  const aggregate=aggregateAtCommonDates(strategies);
  return {
    strategies,summary:aggregate?summarizeObservedPerformance(aggregate.valuations,aggregate.flows):null,
    aggregate,leaderboard:rankOnCommonHistory(strategies),
    benchmarks:availableBenchmarks
  };
}

export function benchmarkComparison(
  values:Valuation[],flows:DatedFlow[],currency:string,benchmarks:BenchmarkHistory[]
) {
  if(!values.length)return {comparisons:[] as Array<{key:string;label:string;defaultVisible:boolean}>,mapped:new Map<string,Record<string,number>>(),missing:["VTI","SPY","QQQ"]};
  const start=values[0];
  const mapped=new Map<string,Record<string,number>>();
  const comparisons:Array<{key:string;label:string;defaultVisible:boolean}>=[];
  const missing:string[]=[];
  for(const ticker of BENCHMARKS) {
    const entry=benchmarks.find(b=>b.key===ticker&&b.currency===currency.toUpperCase());
    if(!entry||!entry.points.some(p=>p.date===start.date)) {missing.push(ticker.toUpperCase());continue;}
    try {
      const simulated=simulateSameCashFlows({index:entry.points,anchorDate:start.date,anchorValue:start.value,flows});
      const index=growthIndex(simulated.map(p=>({date:p.date,value:p.value.toString()})),flows);
      if(index.length<2) {missing.push(ticker.toUpperCase());continue;}
      comparisons.push({key:ticker,label:ticker.toUpperCase(),defaultVisible:ticker==="spy"});
      for(const point of index) {
        const previous=mapped.get(point.date)??{};
        mapped.set(point.date,{...previous,[ticker]:Number(point.value)});
      }
    }catch{missing.push(ticker.toUpperCase());}
  }
  return {comparisons,mapped,missing};
}
