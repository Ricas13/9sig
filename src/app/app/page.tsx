import Link from "next/link";
import { ArrowRight, CheckCircle2, Plus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listUserStrategies } from "@/lib/strategy-service";
import { sql } from "@/lib/db";

function money(value:number,currency:string){
  return new Intl.NumberFormat("en-GB",{style:"currency",currency,maximumFractionDigits:0}).format(value);
}

export default async function OverviewPage(){
  const user=await requireUser();
  const strategies=await listUserStrategies(user.id);
  const actions=await sql.unsafe("SELECT a.id,a.strategy_instance_id,a.title,a.instruction,a.due_at,a.confidence,i.name AS instance_name FROM actions a JOIN strategy_instances i ON i.id=a.strategy_instance_id WHERE i.user_id=$1 AND a.status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED') AND a.action_type<>'NO_ACTION' ORDER BY COALESCE(a.due_at,a.created_at),a.created_at LIMIT 12",[user.id]);
  const values=await sql.unsafe("SELECT ps.strategy_instance_id,ps.value FROM performance_series ps JOIN strategy_instances i ON i.id=ps.strategy_instance_id WHERE i.user_id=$1 AND ps.series_type='USER_VALUE' AND ps.date=(SELECT max(p2.date) FROM performance_series p2 WHERE p2.strategy_instance_id=ps.strategy_instance_id AND p2.series_type='USER_VALUE')",[user.id]);
  const contributions=await sql.unsafe("SELECT COALESCE(sum(l.cash_amount),0) AS total FROM ledger_events l JOIN strategy_instances i ON i.id=l.strategy_instance_id WHERE i.user_id=$1 AND l.event_type='CONTRIBUTION'",[user.id]);
  const knownValue=values.length?values.reduce((sum,r)=>sum+Number(r.value),0):null;
  const activeStrategies=strategies.filter((s:any)=>s.status==="ACTIVE");
  const primaryAction:any=actions[0];
  const plannedContributions=activeStrategies
    .map((s:any)=>({strategy:s,plan:s.contribution_plan as Record<string,unknown>|null}))
    .filter(({plan})=>plan?.enabled===true&&plan.nextDate)
    .sort((a,b)=>String(a.plan?.nextDate).localeCompare(String(b.plan?.nextDate)));
  const nextContribution=plannedContributions[0];

  if(!strategies.length){
    return <section className="glass welcome-state">
      <div className="welcome-orb"><Sparkles size={28}/></div>
      <div className="eyebrow">Welcome</div>
      <h1>Start with one simple decision.</h1>
      <p>Choose a strategy, tell us whether you are starting fresh or already following it, and we will guide you from there.</p>
      <Link className="button primary hero-cta" href="/app/strategies/new"><Plus size={17}/>Start my first strategy</Link>
      <div className="trust-line"><CheckCircle2 size={15}/>No trading is performed automatically. You stay in control of every action.</div>
    </section>;
  }

  return <>
    <div className="dashboard-heading">
      <div>
        <div className="eyebrow">Home</div>
        <h1>{primaryAction?"One thing needs your attention.":"Everything is on track."}</h1>
        <p>{primaryAction?"Your most important next step is ready below.":"There is nothing you need to do right now."}</p>
      </div>
      <Link className="button" href="/app/strategies">View portfolio</Link>
    </div>

    <section className="glass dashboard-hero">
      <div className="portfolio-snapshot">
        <span className="soft-label">Tracked portfolio</span>
        <strong className="portfolio-value">{knownValue==null?"—":money(knownValue,user.baseCurrency)}</strong>
        <div className="portfolio-context">
          <span>{activeStrategies.length} active {activeStrategies.length===1?"strategy":"strategies"}</span>
          <span className="dot-separator">•</span>
          <span>{money(Number(contributions[0]?.total??0),user.baseCurrency)} contributed</span>
        </div>
      </div>

      <div className={"today-card "+(primaryAction?"needs-action":"all-clear")}>
        <div className="today-topline">
          <span className="soft-label">Today</span>
          {primaryAction?<span className={"pill "+(primaryAction.confidence==="HIGH"?"good":"warn")}>{primaryAction.confidence} confidence</span>:<CheckCircle2 size={20}/>}
        </div>
        {primaryAction?<>
          <span className="today-strategy">{primaryAction.instance_name}</span>
          <h2>{primaryAction.title}</h2>
          <p>{primaryAction.instruction}</p>
          <Link className="button primary" href={"/app/strategies/"+primaryAction.strategy_instance_id}>Show me what to do <ArrowRight size={16}/></Link>
        </>:<>
          <h2>Nothing to do.</h2>
          <p>We will surface the next action here when your strategy needs you.</p>
        </>}
      </div>
    </section>

    <div className="quick-strip">
      <div><span>Portfolio</span><strong>{knownValue==null?"Waiting for first valuation":money(knownValue,user.baseCurrency)}</strong></div>
      <div><span>Next contribution</span><strong>{nextContribution?money(Number(nextContribution.plan?.amount??0),String(nextContribution.strategy.currency))+" · "+new Date(String(nextContribution.plan?.nextDate)+"T00:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short"}):"Flexible"}</strong></div>
      <div><span>Attention</span><strong>{actions.length?actions.length+" open":"None"}</strong></div>
    </div>

    <section className="home-section">
      <div className="section-head">
        <div><div className="eyebrow">Your portfolio</div><h2>Strategies</h2><p>Open one only when you want more detail.</p></div>
        <Link className="text-link" href="/app/strategies/new">Add another <ArrowRight size={14}/></Link>
      </div>
      <div className="strategy-grid">
        {strategies.map((s:any)=><Link href={"/app/strategies/"+s.id} className="card strategy-card premium-card" key={s.id}>
          <div className="strategy-card-top"><span className={"status-light "+(s.health_status==="HEALTHY"?"healthy":"attention")}/><span>{s.health_status==="HEALTHY"?"On track":"Needs attention"}</span></div>
          <h3>{s.name}</h3>
          <p>{s.strategy_name} · {s.wrapper}</p>
          <div className="strategy-meta"><span className="pill">v{s.version}</span><span className="pill">{s.currency}</span></div>
          <span className="card-arrow"><ArrowRight size={17}/></span>
        </Link>)}
      </div>
    </section>

    {actions.length>1&&<details className="glass secondary-actions">
      <summary>{actions.length-1} more {actions.length-1===1?"action":"actions"} waiting</summary>
      <div className="secondary-actions-list">{actions.slice(1).map((a:any)=><Link className="secondary-action-row" href={"/app/strategies/"+a.strategy_instance_id} key={a.id}><div><strong>{a.instance_name}</strong><span>{a.title}</span></div><ArrowRight size={16}/></Link>)}</div>
    </details>}
  </>;
}
