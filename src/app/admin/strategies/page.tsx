import { sql } from "@/lib/db";
import { ModelPerformanceEditor, StrategyDefinitionEditor, StrategyVersionEditor } from "@/components/AdminEditors";

export default async function StrategiesAdmin() {
  const rows = await sql.unsafe(
    "SELECT d.key,d.name,d.family,d.engine,d.enabled,d.proprietary,v.id AS version_id,v.version,v.effective_from FROM strategy_definitions d LEFT JOIN LATERAL (SELECT id,version,effective_from FROM strategy_versions v WHERE v.strategy_definition_id=d.id ORDER BY effective_from DESC LIMIT 1) v ON true ORDER BY d.name"
  );

  return <>
    <div className="page-title"><div>
      <div className="eyebrow">Admin · Strategies</div>
      <h1>Definitions & versions</h1>
      <p>Strategy logic is versioned and detached from ticker symbols.</p>
    </div></div>

    <div className="table-wrap"><table>
      <thead><tr><th>Strategy</th><th>Family</th><th>Engine</th><th>Version</th><th>Version UUID</th><th>Enabled</th><th>Proprietary</th></tr></thead>
      <tbody>{rows.map((s:any)=><tr key={s.key}>
        <td>{s.name}</td><td>{s.family}</td><td>{s.engine}</td><td>{s.version??"—"}</td><td>{s.version_id??"—"}</td><td>{s.enabled?"Yes":"No"}</td><td>{s.proprietary?"Yes":"No"}</td>
      </tr>)}</tbody>
    </table></div>

    <div className="detail-grid"><StrategyDefinitionEditor/><StrategyVersionEditor/></div>
    <div style={{marginTop:18}}><ModelPerformanceEditor/></div>
  </>;
}
