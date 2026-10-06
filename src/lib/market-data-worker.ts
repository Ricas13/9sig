import "server-only";
import { sql } from "@/lib/db";
import { getMarketDataProvider } from "@/lib/market-data";

export async function refreshMarketData() {
  const provider = getMarketDataProvider();
  const runRows = await sql.unsafe(
    "INSERT INTO worker_runs (worker_key,status,details) VALUES ('market-data-refresh','RUNNING',$1::jsonb) RETURNING id",
    [JSON.stringify({ provider: provider.name, configured: provider.configured })]
  );
  const runId = String(runRows[0].id);

  if (!provider.configured) {
    await sql.unsafe(
      "UPDATE worker_runs SET status='SKIPPED',finished_at=now(),details=$1::jsonb WHERE id=$2",
      [JSON.stringify({ provider: provider.name, configured: false }), runId]
    );
    return { provider: provider.name, configured: false, refreshed: 0, failed: 0 };
  }

  let refreshed = 0;
  let failed = 0;
  const failures: Array<{ tradingLineId: string; code: string }> = [];

  try {
    const lines = await sql.unsafe(
      "SELECT DISTINCT tl.id,tl.provider_symbol,tl.currency FROM trading_lines tl " +
      "WHERE tl.provider_symbol IS NOT NULL AND tl.effective_from<=current_date AND (tl.effective_to IS NULL OR tl.effective_to>=current_date) " +
      "AND (EXISTS (SELECT 1 FROM ledger_events l JOIN strategy_instances si ON si.id=l.strategy_instance_id WHERE l.instrument_id=tl.instrument_id AND si.status='ACTIVE') " +
      "OR EXISTS (SELECT 1 FROM regional_instrument_mappings m WHERE m.trading_line_id=tl.id AND m.enabled=true AND m.effective_from<=current_date AND (m.effective_to IS NULL OR m.effective_to>=current_date)))"
    );

    for (const line of lines) {
      try {
        const observation = await provider.currentPrice(String(line.provider_symbol));
        if (!observation) {
          failed += 1;
          failures.push({ tradingLineId: String(line.id), code: "NO_QUOTE" });
          continue;
        }
        if (observation.currency !== String(line.currency).toUpperCase()) {
          failed += 1;
          failures.push({ tradingLineId: String(line.id), code: "CURRENCY_MISMATCH" });
          continue;
        }
        await sql.unsafe(
          "INSERT INTO market_data_observations (trading_line_id,observed_at,price,currency,provider,freshness) VALUES ($1,$2,$3,$4,$5,'CURRENT') ON CONFLICT (trading_line_id,observed_at,provider) DO NOTHING",
          [line.id, observation.observedAt, observation.price, observation.currency, observation.provider]
        );
        refreshed += 1;
      } catch (error) {
        failed += 1;
        failures.push({
          tradingLineId: String(line.id),
          code: error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN"
        });
      }
    }

    await sql.unsafe(
      "UPDATE worker_runs SET status=$1,finished_at=now(),details=$2::jsonb WHERE id=$3",
      [failed ? "PARTIAL" : "SUCCESS", JSON.stringify({ provider: provider.name, configured: true, refreshed, failed, failures: failures.slice(0, 50) }), runId]
    );
    return { provider: provider.name, configured: true, refreshed, failed };
  } catch (error) {
    await sql.unsafe(
      "UPDATE worker_runs SET status='FAILED',finished_at=now(),details=$1::jsonb WHERE id=$2",
      [JSON.stringify({ provider: provider.name, error: error instanceof Error ? error.message : "UNKNOWN" }), runId]
    );
    throw error;
  }
}
