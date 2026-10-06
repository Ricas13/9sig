import { sql } from "@/lib/db";
import { ModelPerformanceEditor, StrategyDefinitionEditor, StrategyVersionEditor, StrategyVersionManager } from "@/components/AdminEditors";

export default async function StrategiesAdmin() {
  const definitions = await sql.unsafe(
    "SELECT key,name,family,engine,enabled,proprietary FROM strategy_definitions ORDER BY name"
  );
  const versions = await sql.unsafe(
    "SELECT d.key,d.name,v.id AS version_id,v.version,v.engine_key,v.lifecycle_status,v.upgrade_policy,v.effective_from,v.effective_to,v.published_at "+
    "FROM strategy_versions v JOIN strategy_definitions d ON d.id=v.strategy_definition_id ORDER BY d.name,v.effective_from DESC,v.created_at DESC"
  );

  return <>
    <div className="page-title"><div>
      <div className="eyebrow">Admin · Strategies</div>
      <h1>Definitions & releases</h1>
      <p>Create metadata freely; change rules through draft → publish → retire releases so existing users never change silently.</p>
    </div></div>

    <div className="table-wrap"><table>
      <thead><tr><th>Strategy</th><th>Family</th><th>Default engine</th><th>Enabled</th><th>Proprietary</th></tr></thead>
      <tbody>{definitions.map((s:any)=><tr key={s.key}><td>{s.name}</td><td>{s.family}</td><td>{s.engine}</td><td>{s.enabled?"Yes":"No"}</td><td>{s.proprietary?"Yes":"No"}</td></tr>)}</tbody>
    </table></div>

    <div className="table-wrap" style={{marginTop:16}}><table>
      <thead><tr><th>Strategy</th><th>Version</th><th>UUID</th><th>Engine snapshot</th><th>Status</th><th>Upgrade</th><th>Effective</th></tr></thead>
      <tbody>{versions.map((v:any)=><tr key={v.version_id}><td>{v.name}</td><td>{v.version}</td><td>{v.version_id}</td><td>{v.engine_key}</td><td>{v.lifecycle_status}</td><td>{v.upgrade_policy}</td><td>{String(v.effective_from).slice(0,10)}{v.effective_to?" → "+String(v.effective_to).slice(0,10):""}</td></tr>)}</tbody>
    </table></div>

    <div className="detail-grid"><StrategyDefinitionEditor/><StrategyVersionEditor/></div>
    <div style={{marginTop:18}}><StrategyVersionManager/></div>
    <div style={{marginTop:18}}><ModelPerformanceEditor/></div>
  </>;
}
