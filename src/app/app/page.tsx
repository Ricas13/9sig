import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listUserStrategies } from "@/lib/strategy-service";
import { sql } from "@/lib/db";

function formatBreakdown(rows:any[],field:string,baseCurrency:string){
  const available=rows
    .filter((row)=>row[field]!=null)
    .sort((a,b)=>String(a.currency)===baseCurrency?-1:String(b.currency)===baseCurrency?1:String(a.currency).localeCompare(String(b.currency)));
  if(!available.length)return "—";
  return available.map((row)=>new Intl.NumberFormat("en-GB",{
    style:"currency",currency:String(row.currency),maximumFractionDigits:0
  }).format(Number(row[field]))).join(" · ");
}

export default async function OverviewPage(){
  const user=await requireUser();
  const strategies=await listUserStrategies(user.id);
  const actions=await sql.unsafe(
    "SELECT a.id,a.title,a.instruction,a.due_at,a.confidence,i.name AS instance_name FROM actions a JOIN strategy_instances i ON i.id=a.strategy_instance_id WHERE i.user_id=$1 AND i.status='ACTIVE' AND a.status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED') AND a.action_type<>'NO_ACTION' ORDER BY COALESCE(a.due_at,a.created_at),a.created_at LIMIT 12",
    [user.id]
  );

  const totals=await sql.unsafe(
    "WITH latest AS ("+
    " SELECT DISTINCT ON (ps.strategy_instance_id) ps.strategy_instance_id,ps.value"+
    " FROM performance_series ps JOIN strategy_instances i ON i.id=ps.strategy_instance_id"+
    " WHERE i.user_id=$1 AND i.status='ACTIVE' AND ps.series_type='USER_VALUE'"+
    " ORDER BY ps.strategy_instance_id,ps.date DESC"+
    "), tracked AS ("+
    " SELECT a.currency,sum(l.value)::numeric AS tracked_value"+
    " FROM latest l JOIN strategy_instances i ON i.id=l.strategy_instance_id JOIN accounts a ON a.id=i.account_id GROUP BY a.currency"+
    "), flows AS ("+
    " SELECT a.currency,"+
    " sum(CASE WHEN le.event_type='CONTRIBUTION' THEN le.cash_amount ELSE 0 END)::numeric AS contributions,"+
    " sum(CASE WHEN le.event_type IN ('CONTRIBUTION','WITHDRAWAL') THEN le.cash_amount ELSE 0 END)::numeric AS net_external"+
    " FROM ledger_events le JOIN strategy_instances i ON i.id=le.strategy_instance_id JOIN accounts a ON a.id=i.account_id"+
    " WHERE i.user_id=$1 AND i.status='ACTIVE' GROUP BY a.currency"+
    "), resume AS ("+
    " SELECT a.currency,count(*) FILTER (WHERE i.onboarding_mode='RESUME')::int AS resume_count"+
    " FROM strategy_instances i JOIN accounts a ON a.id=i.account_id WHERE i.user_id=$1 AND i.status='ACTIVE' GROUP BY a.currency"+
    "), currencies AS ("+
    " SELECT currency FROM tracked UNION SELECT currency FROM flows UNION SELECT currency FROM resume"+
    ") SELECT c.currency,t.tracked_value,f.contributions,f.net_external,r.resume_count,"+
    " CASE WHEN COALESCE(r.resume_count,0)=0 AND t.tracked_value IS NOT NULL THEN t.tracked_value-COALESCE(f.net_external,0) ELSE NULL END AS gain_loss"+
    " FROM currencies c LEFT JOIN tracked t USING(currency) LEFT JOIN flows f USING(currency) LEFT JOIN resume r USING(currency) ORDER BY c.currency",
    [user.id]
  );

  const activeCount=strategies.filter((s:any)=>s.status==="ACTIVE").length;
  return <>
    <div className="page-title">
      <div><div className="eyebrow">Overview</div><h1>Where am I?</h1><p>Your configured strategies, one action queue.</p></div>
      <Link className="button primary" href="/app/strategies/new">Add strategy</Link>
    </div>
    <div className="metrics">
      <div className="glass metric"><small>Tracked value</small><strong>{formatBreakdown(totals,"tracked_value",user.baseCurrency)}</strong></div>
      <div className="glass metric"><small>Total contributions</small><strong>{formatBreakdown(totals,"contributions",user.baseCurrency)}</strong></div>
      <div className="glass metric"><small>Gain / loss</small><strong>{formatBreakdown(totals,"gain_loss",user.baseCurrency)}</strong></div>
      <div className="glass metric"><small>Actions requiring attention</small><strong>{actions.length}</strong></div>
    </div>
    <p className="help" style={{marginTop:8}}>Currencies are never added together without an explicit FX source. Gain/loss is withheld for resumed accounts whose pre-platform contribution history is incomplete. Active strategies: {activeCount}.</p>
    <section className="glass action-queue">
      <div className="section-head"><div><h2>Global action queue</h2><p>What needs attention across every active strategy.</p></div></div>
      {actions.length?actions.map((a:any)=><div className="action-row" key={a.id}>
        <div className="action-time">{a.due_at?new Date(a.due_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}):"NOW"}</div>
        <div><div className="action-title">{a.instance_name}</div><div className="action-sub">{a.title} · {a.instruction}</div></div>
        <span className={"pill "+(a.confidence==="HIGH"?"good":"warn")}>{a.confidence}</span>
      </div>):<div className="empty">Everything is on track. No outstanding strategy actions.</div>}
    </section>
    <div className="strategy-grid">{strategies.map((s:any)=><Link href={"/app/strategies/"+s.id} className="card strategy-card" key={s.id}><div className={"pill "+(s.health_status==="HEALTHY"?"good":"warn")}>{s.health_status.replaceAll("_"," ")}</div><h3 style={{marginTop:15}}>{s.name}</h3><p>{s.strategy_name} · {s.wrapper} · v{s.version}</p><div className="strategy-meta"><span className="pill">{s.status}</span><span className="pill">{s.currency}</span></div></Link>)}</div>
    {!strategies.length&&<div className="empty" style={{marginTop:16}}>No strategies yet. <Link href="/app/strategies/new">Add your first strategy.</Link></div>}
  </>;
}
