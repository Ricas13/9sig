import "server-only";
import { sql } from "@/lib/db";

const PUBLIC_THRESHOLD = 20;

export async function rebuildAnonymousAggregates(asOf = new Date()) {
  const runRows = await sql.unsafe(
    "INSERT INTO worker_runs (worker_key,status,details) VALUES ('anonymous-aggregates','RUNNING','{}'::jsonb) RETURNING id"
  );
  const runId = String(runRows[0].id);
  try {
    const definitions = await sql.unsafe("SELECT id FROM strategy_definitions ORDER BY id");
    let written = 0;
    for (const definition of definitions) {
      const strategyDefinitionId = String(definition.id);
      const base = await sql.unsafe(
        "WITH eligible AS (" +
        " SELECT i.id FROM strategy_instances i JOIN users u ON u.id=i.user_id" +
        " WHERE i.strategy_definition_id=$1 AND u.anonymous_aggregate_opt_in=true AND u.deleted_at IS NULL" +
        "), valued AS (" +
        " SELECT e.id," +
        "   (SELECT p.value FROM performance_series p WHERE p.strategy_instance_id=e.id AND p.series_type='USER_VALUE' ORDER BY p.date ASC LIMIT 1) AS first_value," +
        "   (SELECT p.value FROM performance_series p WHERE p.strategy_instance_id=e.id AND p.series_type='USER_VALUE' ORDER BY p.date DESC LIMIT 1) AS last_value" +
        " FROM eligible e" +
        "), returns AS (" +
        " SELECT id,(last_value/NULLIF(first_value,0)-1)::numeric AS r FROM valued WHERE first_value IS NOT NULL AND last_value IS NOT NULL AND first_value<>0" +
        ")" +
        " SELECT (SELECT count(*) FROM eligible)::int AS tracked_instances," +
        " (SELECT count(*) FROM returns)::int AS return_sample_size," +
        " (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY r) FROM returns) AS median_return," +
        " (SELECT count(DISTINCT a.strategy_instance_id)::numeric/NULLIF((SELECT count(*) FROM eligible),0)" +
        "    FROM actions a JOIN eligible e ON e.id=a.strategy_instance_id" +
        "    WHERE a.status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED') AND a.action_type NOT IN ('NO_ACTION','HOLD')) AS action_required_pct",
        [strategyDefinitionId]
      );
      const row = base[0];
      const date = asOf.toISOString().slice(0,10);
      const tracked = Number(row?.tracked_instances ?? 0);
      const returnN = Number(row?.return_sample_size ?? 0);
      const metrics: Array<[string, number, string | null]> = [
        ["TRACKED_INSTANCES", tracked, String(tracked)]
      ];
      if (row?.median_return != null) metrics.push(["MEDIAN_USER_RETURN", returnN, String(row.median_return)]);
      if (row?.action_required_pct != null) metrics.push(["ACTION_REQUIRED_PCT", tracked, String(row.action_required_pct)]);
      for (const [metricKey, sampleSize, value] of metrics) {
        if (value == null) continue;
        await sql.unsafe(
          "INSERT INTO anonymous_aggregates (strategy_definition_id,cohort_key,metric_key,as_of_date,sample_size,value,metadata)" +
          " VALUES ($1,'ALL',$2,$3,$4,$5,$6::jsonb)" +
          " ON CONFLICT (strategy_definition_id,cohort_key,metric_key,as_of_date)" +
          " DO UPDATE SET sample_size=EXCLUDED.sample_size,value=EXCLUDED.value,metadata=EXCLUDED.metadata",
          [strategyDefinitionId,metricKey,date,sampleSize,value,JSON.stringify({publicThreshold:PUBLIC_THRESHOLD,method:metricKey==="MEDIAN_USER_RETURN"?"median-instance-return":"derived-cohort-statistic"})]
        );
        written += 1;
      }
    }
    await sql.unsafe("UPDATE worker_runs SET status='SUCCESS',finished_at=now(),details=$1::jsonb WHERE id=$2",[JSON.stringify({written,publicThreshold:PUBLIC_THRESHOLD}),runId]);
    return {written,publicThreshold:PUBLIC_THRESHOLD};
  } catch (error) {
    await sql.unsafe("UPDATE worker_runs SET status='FAILED',finished_at=now(),details=$1::jsonb WHERE id=$2",[JSON.stringify({error:error instanceof Error?error.message:"unknown"}),runId]);
    throw error;
  }
}

export function publicAggregateThreshold() {
  return PUBLIC_THRESHOLD;
}
