import Link from "next/link";
import { ArrowRight, CheckCircle2, Plus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listUserStrategies } from "@/lib/strategy-service";
import { sql } from "@/lib/db";
import { plainEnglishActionReason } from "@/domain/action-copy";

function money(value:number,currency:string){
  return new Intl.NumberFormat("en-GB",{style:"currency",currency,maximumFractionDigits:0}).format(value);
}

export default async function OverviewPage(){
  const user=await requireUser();
  const strategies=await listUserStrategies(user.id);
  const actions=await sql.unsafe("SELECT a.id,a.strategy_instance_id,a.action_type,a.title,a.instruction,a.due_at,a.confidence,i.name AS instance_name,acc.name AS account_name,acc.wrapper AS account_wrapper FROM actions a JOIN strategy_instances i ON i.id=a.strategy_instance_id LEFT JOIN accounts acc ON acc.id=a.account_id WHERE i.user_id=$1 AND a.status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED') AND a.action_type<>'NO_ACTION' ORDER BY COALESCE(a.due_at,a.created_at),a.created_at LIMIT 12",[user.id]);
  const values=await sql.unsafe("SELECT ps.strategy_instance_id,ps.value,a.currency FROM performance_series ps JOIN strategy_instances i ON i.id=ps.strategy_instance_id JOIN accounts a ON a.id=i.account_id WHERE i.user_id=$1 AND i.status<>'CLOSED' AND ps.series_type='USER_VALUE' AND ps.date=(SELECT max(p2.date) FROM performance_series p2 WHERE p2.strategy_instance_id=ps.strategy_instance_id AND p2.series_type='USER_VALUE')",[user.id]);
  const contributions=await sql.unsafe("SELECT l.currency,COALESCE(sum(l.cash_amount),0) AS total FROM ledger_events l JOIN strategy_instances i ON i.id=l.strategy_instance_id WHERE i.user_id=$1 AND i.status<>'CLOSED' AND l.event_type='CONTRIBUTION' GROUP BY l.currency ORDER BY l.currency",[user.id]);
  const reviewRows=await sql.unsafe("SELECT i.id,i.name,x.due_at FROM strategy_instances i LEFT JOIN LATERAL (SELECT a.due_at FROM actions a WHERE a.strategy_instance_id=i.id AND a.due_at IS NOT NULL ORDER BY a.created_at DESC LIMIT 1) x ON true WHERE i.user_id=$1 AND i.status='ACTIVE'",[user.id]);
  const activeStrategies=strategies.filter((s:any)=>s.status==="ACTIVE");
  const trackedStrategies=strategies.filter((s:any)=>s.status!=="CLOSED");
  const valuedIds=new Set(values.map((row:any)=>String(row.strategy_instance_id)));
  const portfolioFullyValued=trackedStrategies.length>0&&trackedStrategies.every((strategy:any)=>valuedIds.has(String(strategy.id)));
  const totalsByCurrency=new Map<string,number>();
  for(const row of values){
    const currency=String(row.currency);
    totalsByCurrency.set(currency,(totalsByCurrency.get(currency)??0)+Number(row.value));
  }
  const portfolioCurrencyEntries=[...totalsByCurrency.entries()];
  const portfolioHeadline=!portfolioFullyValued
    ?"—"
    :portfolioCurrencyEntries.length===1
      ?money(portfolioCurrencyEntries[0][1],portfolioCurrencyEntries[0][0])
      :"Multi-currency";
  const portfolioValueContext=!portfolioFullyValued
    ?(values.length?values.length+" of "+trackedStrategies.length+" strategies currently valued":"Waiting for current valuations")
    :portfolioCurrencyEntries.length>1
      ?portfolioCurrencyEntries.map(([currency,value])=>money(value,currency)).join(" · ")
      :null;
  const contributionContext=contributions.length
    ?contributions.map((row:any)=>money(Number(row.total),String(row.currency))).join(" · ")
    :"No contributions recorded";
  const primaryAction:any=actions[0];
  const primaryReason=primaryAction?plainEnglishActionReason({actionType:primaryAction.action_type,instruction:primaryAction.instruction}):null;
  const plannedContributions=activeStrategies
    .map((s:any)=>({strategy:s,plan:s.contribution_plan as Record<string,unknown>|null}))
    .filter(({plan})=>plan?.enabled===true&&plan.nextDate)
    .sort((a,b)=>String(a.plan?.nextDate).localeCompare(String(b.plan?.nextDate)));
  const nextContribution=plannedContributions[0];
  const nextReview=reviewRows.filter((row:any)=>row.due_at).sort((a:any,b:any)=>new Date(a.due_at).getTime()-new Date(b.due_at).getTime())[0];
  const healthyCount=activeStrategies.filter((strategy:any)=>strategy.health_status==="HEALTHY").length;

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
        <strong className="portfolio-value">{portfolioHeadline}</strong>
        <div className="portfolio-context">
          <span>{activeStrategies.length} active {activeStrategies.length===1?"strategy":"strategies"}</span>
          <span className="dot-separator">•</span>
          <span>{portfolioValueContext??contributionContext}</span>
        </div>
        {portfolioValueContext&&portfolioFullyValued&&<div className="portfolio-context secondary-context"><span>{contributionContext} contributed</span></div>}
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
          {primaryAction.account_name&&<div className="action-account-hint"><span>Use <strong>{primaryAction.account_name}</strong>{primaryAction.account_wrapper?" · "+primaryAction.account_wrapper:""}</span></div>}
          {primaryReason&&<div className="plain-reason"><Sparkles size={14}/><span>{primaryReason}</span></div>}
          <Link className="button primary" href={"/app/strategies/"+primaryAction.strategy_instance_id}>Show me what to do <ArrowRight size={16}/></Link>
        </>:<>
          <h2>Nothing to do.</h2>
          <p>We will surface the next action here when your strategy needs you.</p>
        </>}
      </div>
    </section>

    <div className="quick-strip">
      <div><span>Strategy health</span><strong>{activeStrategies.length?healthyCount+" of "+activeStrategies.length+" on track":"—"}</strong></div>
      <div><span>Next review</span><strong>{nextReview?new Date(nextReview.due_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):"When needed"}</strong></div>
      <div><span>Next contribution</span><strong>{nextContribution?money(Number(nextContribution.plan?.amount??0),String(nextContribution.strategy.currency))+" · "+new Date(String(nextContribution.plan?.nextDate)+"T00:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short"}):"Flexible"}</strong></div>
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
