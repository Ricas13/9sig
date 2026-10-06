import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { sql } from "@/lib/db";
import { simulateSameCashFlows } from "@/domain/comparison";
import { PerformanceChart } from "@/components/PerformanceChart";
import { CashEventForm, ContributionForm, ExecuteAction, OpeningSnapshotForm, RecalculateButton, ReconcileForm, ReverseLedgerEventButton, StrategyLifecycleControls, StrategyVersionUpgrade } from "@/components/StrategyActions";

export default async function StrategyPage({params}:{params:Promise<{id:string}>}){
  const user=await requireUser();
  const {id}=await params;
  const s:any=await getStrategyForUser(user.id,id);
  if(!s)notFound();

  const actionRows=await sql.unsafe("SELECT id,action_type,status,title,instruction,amount,currency,explanation,confidence,due_at,created_at FROM actions WHERE strategy_instance_id=$1 AND status IN ('CALCULATED','NOTIFIED','ACKNOWLEDGED') ORDER BY created_at DESC LIMIT 1",[id]);
  const action=actionRows[0];

  const performance=await sql.unsafe("SELECT date,series_type,value FROM performance_series WHERE strategy_instance_id=$1 ORDER BY date",[id]);
  const actualPoints=performance
    .filter((p:any)=>p.series_type==="USER_VALUE")
    .map((p:any)=>({date:String(p.date).slice(0,10),value:String(p.value)}));

  const canonical=await sql.unsafe(
    "SELECT date,value,benchmark_value FROM canonical_model_performance WHERE strategy_version_id=$1 ORDER BY date",
    [s.strategy_version_id]
  );
  const externalFlows=await sql.unsafe(
    "SELECT occurred_at::date AS date,cash_amount FROM ledger_events WHERE strategy_instance_id=$1 AND currency=$2 AND event_type IN ('CONTRIBUTION','WITHDRAWAL') ORDER BY occurred_at,created_at",
    [id,s.currency]
  );

  const byDate=new Map<string,{date:string;actual?:number;model?:number;benchmark?:number}>();
  for(const point of actualPoints){
    byDate.set(point.date,{date:point.date,actual:Number(point.value)});
  }

  if(actualPoints.length&&canonical.length){
    const anchor=actualPoints[0];
    const flows=externalFlows.map((flow:any)=>({date:String(flow.date).slice(0,10),amount:String(flow.cash_amount)}));
    const model=simulateSameCashFlows({
      index:canonical.map((p:any)=>({date:String(p.date).slice(0,10),value:String(p.value)})),
      anchorDate:anchor.date,
      anchorValue:anchor.value,
      flows
    });
    for(const point of model){
      const item=byDate.get(point.date)??{date:point.date};
      item.model=point.value.toNumber();
      byDate.set(point.date,item);
    }

    const benchmarkIndex=canonical
      .filter((p:any)=>p.benchmark_value!=null)
      .map((p:any)=>({date:String(p.date).slice(0,10),value:String(p.benchmark_value)}));
    if(benchmarkIndex.length){
      const benchmark=simulateSameCashFlows({
        index:benchmarkIndex,
        anchorDate:anchor.date,
        anchorValue:anchor.value,
        flows
      });
      for(const point of benchmark){
        const item=byDate.get(point.date)??{date:point.date};
        item.benchmark=point.value.toNumber();
        byDate.set(point.date,item);
      }
    }
  }

  const chartData=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const contributions=await sql.unsafe("SELECT id,occurred_at,cash_amount,provenance,confidence FROM ledger_events WHERE strategy_instance_id=$1 AND currency=$2 AND event_type='CONTRIBUTION' ORDER BY occurred_at DESC LIMIT 8",[id,s.currency]);
  const reconciliations=await sql.unsafe("SELECT occurred_at,expected_value,broker_reported_value,difference,reason FROM reconciliations WHERE strategy_instance_id=$1 ORDER BY occurred_at DESC LIMIT 5",[id]);
  const cashEvents=await sql.unsafe("SELECT id,occurred_at,event_type,cash_amount,fee_amount,metadata FROM ledger_events WHERE strategy_instance_id=$1 AND currency=$2 AND event_type IN ('WITHDRAWAL','DIVIDEND','DISTRIBUTION','INTEREST','FEE','TAX') ORDER BY occurred_at DESC,created_at DESC LIMIT 12",[id,s.currency]);
  const latestValue=actualPoints.at(-1);
  const explanation=Array.isArray(action?.explanation)?action.explanation:[];
  const needsOpeningSnapshot=Boolean(s.state?.resumeNeedsReconciliation);
  const hasVersionUpdate=Boolean(s.latest_version_id)&&String(s.latest_version_id)!==String(s.strategy_version_id);

  return <>
    <div className="page-title">
      <div><div className="eyebrow">{s.strategy_name} · v{s.version}</div><h1>{s.name}</h1><p>{s.description}</p></div>
      <div className="inline">
        <span className={"pill "+(s.health_status==="HEALTHY"?"good":"warn")}>{s.health_status.replaceAll("_"," ")}</span>
        {s.status==="ACTIVE"&&<RecalculateButton id={id}/>}
        <StrategyLifecycleControls id={id} status={s.status}/>
      </div>
    </div>

    <div className="metrics">
      <div className="glass metric"><small>Current tracked value</small><strong>{latestValue?new Intl.NumberFormat("en-GB",{style:"currency",currency:s.currency,maximumFractionDigits:0}).format(Number(latestValue.value)):"—"}</strong></div>
      <div className="glass metric"><small>Account</small><strong>{s.wrapper}</strong></div>
      <div className="glass metric"><small>Last reconciliation</small><strong>{s.last_reconciled_at?new Date(s.last_reconciled_at).toLocaleDateString("en-GB"):"Never"}</strong></div>
      <div className="glass metric"><small>Data confidence</small><strong>{action?.confidence??s.state_confidence??"—"}</strong></div>
    </div>

    <div className="detail-grid">
      <section className="glass action-card">
        <div className={"pill "+(action?.confidence==="HIGH"?"good":"warn")}>NEXT ACTION</div>
        <h2>{action?.title??(s.status==="ACTIVE"?"No calculated action":"Strategy "+String(s.status).toLowerCase())}</h2>
        <p>{action?.instruction??(s.status==="ACTIVE"?"Recalculate when your ledger and market data are ready.":"Resume this strategy to calculate new actions.")}</p>
        {explanation.length>0&&<div className="why"><div className="eyebrow">Why?</div>{explanation.map((row:any,i:number)=><div className="why-row" key={i}><span>{row.label}</span><b>{row.value}</b></div>)}</div>}
        {action&&s.status==="ACTIVE"&&action.action_type!=="DATA_REQUIRED"&&action.action_type!=="NO_ACTION"&&<div style={{marginTop:18}}><ExecuteAction action={{id:String(action.id),actionType:String(action.action_type)}}/></div>}
      </section>
      <section className="glass form-card">
        <div className="eyebrow">Strategy health</div>
        <h3>{s.health_status==="HEALTHY"?"Healthy":"Needs attention"}</h3>
        <p className="help">A high-confidence financial action is suppressed whenever critical holdings, FX, market data or reconciliation state is stale, missing or unresolved.</p>
        <div className="strategy-meta"><span className="pill">Version {s.version}</span><span className="pill">{s.currency}</span><span className="pill">{s.onboarding_mode.replaceAll("_"," ")}</span><span className="pill">{s.status}</span></div>
      </section>
    </div>

    {hasVersionUpdate&&<StrategyVersionUpgrade id={id} currentVersion={String(s.version)} targetVersionId={String(s.latest_version_id)} targetVersion={String(s.latest_version)} releaseNotes={s.latest_release_notes?String(s.latest_release_notes):null} upgradePolicy={String(s.latest_upgrade_policy??"OPTIONAL")} inputSchema={Array.isArray(s.latest_input_schema)?s.latest_input_schema:[]} currentSettings={(s.settings??{}) as Record<string,unknown>}/>}
    {needsOpeningSnapshot&&<section className="glass form-card" style={{marginTop:16}}>
      <div className="eyebrow">Quick Resume</div><h3>Enter your current holdings snapshot</h3>
      <p className="help">Actions remain blocked until current cash and holdings are recorded.</p>
      <OpeningSnapshotForm id={id}/>
    </section>}

    <section className="glass chart-card">
      <div className="section-head"><div><h2>Performance</h2><p>Actual account value vs the same cash flows applied to the canonical model and benchmark.</p></div></div>
      <PerformanceChart data={chartData}/>
      <p className="help">Model and benchmark lines begin only when canonical history exists. Contributions and withdrawals after the first tracked value are applied to every comparison series so deposits are not mistaken for outperformance.</p>
    </section>

    <div className="detail-grid">
      <section className="glass form-card"><h3>Record contribution</h3><p className="help">A contribution is cash first. It does not imply a security purchase.</p><ContributionForm id={id}/></section>
      <section className="glass form-card"><h3>Other cash event</h3><p className="help">Record ordinary account cash movements without misclassifying them as contributions or reconciliation drift.</p><CashEventForm id={id}/></section>
    </div>
    <div className="detail-grid">
      <section className="glass form-card"><h3>Reconcile to broker</h3><p className="help">Known cash differences create adjustment events. Unexplained valuation differences block new financial actions instead of rewriting history.</p><ReconcileForm id={id} expected={latestValue?Number(latestValue.value):null}/></section>
      <section className="card"><h3>Recent cash events</h3>{cashEvents.length?cashEvents.map((event:any)=><div className="why-row" key={String(event.occurred_at)+String(event.event_type)}><span>{new Date(event.occurred_at).toLocaleDateString("en-GB")} · {String(event.event_type).replaceAll("_"," ")}</span><span className="inline"><b>{new Intl.NumberFormat("en-GB",{style:"currency",currency:s.currency}).format(Math.abs(Number(event.cash_amount||event.fee_amount||0)))}</b><ReverseLedgerEventButton strategyId={id} eventId={String(event.id)}/></span></div>):<p className="help">No withdrawals, income, fees or tax recorded yet.</p>}</section>
    </div>

    <div className="detail-grid">
      <section className="card"><h3>Contribution history</h3>{contributions.length?contributions.map((c:any,i:number)=><div className="why-row" key={i}><span>{new Date(c.occurred_at).toLocaleString("en-GB")}</span><span className="inline"><b>{new Intl.NumberFormat("en-GB",{style:"currency",currency:s.currency}).format(Number(c.cash_amount))}</b><ReverseLedgerEventButton strategyId={id} eventId={String(c.id)}/></span></div>):<p className="help">No contributions recorded.</p>}</section>
      <section className="card"><h3>Reconciliation history</h3>{reconciliations.length?reconciliations.map((r:any,i:number)=><div className="why-row" key={i}><span>{new Date(r.occurred_at).toLocaleDateString("en-GB")} · {r.reason??"Adjustment"}</span><b>{Number(r.difference).toFixed(2)}</b></div>):<p className="help">No reconciliations yet.</p>}</section>
    </div>

    <section className="card" style={{marginTop:16}}>
      <div className="eyebrow">Rules & disclosure</div><h3>Versioned strategy definition</h3><p>{s.disclosure}</p>
      <details><summary>Show configured engine inputs</summary><pre style={{whiteSpace:"pre-wrap",color:"var(--muted)"}}>{JSON.stringify(s.config,null,2)}</pre></details>
    </section>
  </>;
}
