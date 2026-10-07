import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarClock, CheckCircle2, ChevronRight, Sparkles, WalletCards } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getStrategyForUser } from "@/lib/strategy-service";
import { sql } from "@/lib/db";
import { loadEntitlements } from "@/lib/entitlement-service";
import { simulateSameCashFlows } from "@/domain/comparison";
import { PerformanceChart } from "@/components/PerformanceChart";
import { plainEnglishActionReason } from "@/domain/action-copy";
import { CashEventForm, ContributionForm, ContributionPlanForm, ExecuteAction, ExecutionConstraintsForm, OpeningSnapshotForm, RecalculateButton, ReconcileForm, ReverseLedgerEventButton, StrategyLifecycleControls, StrategyVersionUpgrade, WhatIfPreview } from "@/components/StrategyActions";

function money(value:number,currency:string){
  return new Intl.NumberFormat("en-GB",{style:"currency",currency,maximumFractionDigits:0}).format(value);
}

function readableExposure(value:unknown){
  return String(value??"").replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());
}

function percent(value:unknown){
  const number=Number(value);
  return Number.isFinite(number)?new Intl.NumberFormat("en-GB",{style:"percent",maximumFractionDigits:2}).format(number):"—";
}

function strategyRuleRows(engine:string,config:Record<string,unknown>){
  if(engine==="VALUE_TARGET"){
    return [
      {label:"Target exposure",value:readableExposure(config.targetExposure)},
      {label:"Review rhythm",value:readableExposure(config.reviewFrequency??"Quarterly")},
      {label:"Target growth per review",value:percent(config.targetRate??0)},
      {label:"New-money target share",value:percent(config.contributionTargetRatio??0)},
      {label:"Trade tolerance",value:percent(config.tolerance??0)},
      {label:"Maximum cash used per action",value:percent(config.maxCashUse??1)}
    ];
  }
  if(engine==="FIXED_ALLOCATION"){
    const allocations=Array.isArray(config.allocations)?config.allocations as Array<Record<string,unknown>>:[];
    return [
      ...allocations.map((allocation)=>({label:readableExposure(allocation.exposure),value:percent(allocation.weight)})),
      {label:"Review rhythm",value:readableExposure(config.reviewFrequency??"Quarterly")},
      {label:"Rebalance threshold",value:percent(config.rebalanceThreshold??0)}
    ];
  }
  return Object.entries(config)
    .filter(([,value])=>["string","number","boolean"].includes(typeof value))
    .slice(0,8)
    .map(([key,value])=>({label:readableExposure(key),value:String(value)}));
}

export default async function StrategyPage({params}:{params:Promise<{id:string}>}){
  const user=await requireUser();
  const {id}=await params;
  const s:any=await getStrategyForUser(user.id,id);
  if(!s)notFound();
  const entitlements=await loadEntitlements(user.id);
  const canWhatIf=entitlements.features.has("what_if");

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
  const configuredBenchmarkRows=await sql.unsafe(
    "SELECT b.key,svb.label,svb.default_visible,svb.sort_order,bp.date,bp.value FROM strategy_version_benchmarks svb JOIN benchmarks b ON b.id=svb.benchmark_id JOIN benchmark_performance bp ON bp.benchmark_id=b.id WHERE svb.strategy_version_id=$1 ORDER BY svb.sort_order,b.key,bp.date",
    [s.strategy_version_id]
  );
  const externalFlows=await sql.unsafe(
    "SELECT occurred_at::date AS date,event_type,cash_amount FROM ledger_events WHERE strategy_instance_id=$1 AND event_type IN ('CONTRIBUTION','WITHDRAWAL') ORDER BY occurred_at,created_at",
    [id]
  );
  const reviewEvents=await sql.unsafe(
    "SELECT executed_at::date AS date,title FROM actions WHERE strategy_instance_id=$1 AND status='EXECUTED' AND action_type IN ('BUY','SELL','REBALANCE','HOLD') AND executed_at IS NOT NULL ORDER BY executed_at",
    [id]
  );

  const byDate=new Map<string,{date:string;actual?:number;model?:number;benchmark?:number;benchmarkValues?:Record<string,number>}>();
  const comparisonWarnings:string[]=[];
  for(const point of actualPoints){
    byDate.set(point.date,{date:point.date,actual:Number(point.value)});
  }

  if(actualPoints.length&&canonical.length){
    const anchor=actualPoints[0];
    const flows=externalFlows.map((flow:any)=>({date:String(flow.date).slice(0,10),amount:String(flow.cash_amount)}));
    try{
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
    }catch{
      comparisonWarnings.push("Strategy-model comparison is unavailable for part of this history because a withdrawal exceeds the counterfactual value.");
    }

    const benchmarkIndex=canonical
      .filter((p:any)=>p.benchmark_value!=null)
      .map((p:any)=>({date:String(p.date).slice(0,10),value:String(p.benchmark_value)}));
    if(benchmarkIndex.length){
      try{
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
      }catch{
        comparisonWarnings.push("Benchmark comparison is unavailable for part of this history because a withdrawal exceeds the counterfactual value.");
      }
    }
  }


  const comparisonSeriesMap=new Map<string,{key:string;label:string;defaultVisible:boolean;points:Array<{date:string;value:string}>}>();
  for(const row of configuredBenchmarkRows){
    const key=String(row.key);
    const item=comparisonSeriesMap.get(key)??{key,label:String(row.label),defaultVisible:Boolean(row.default_visible),points:[]};
    item.points.push({date:String(row.date).slice(0,10),value:String(row.value)});
    comparisonSeriesMap.set(key,item);
  }
  const comparisonSeries=[...comparisonSeriesMap.values()];
  if(actualPoints.length&&comparisonSeries.length){
    const anchorPoint=actualPoints[0];
    const flows=externalFlows.map((flow:any)=>({date:String(flow.date).slice(0,10),amount:String(flow.cash_amount)}));
    for(const series of comparisonSeries){
      try{
        const simulated=simulateSameCashFlows({index:series.points,anchorDate:anchorPoint.date,anchorValue:anchorPoint.value,flows});
        for(const point of simulated){
          const item=byDate.get(point.date)??{date:point.date};
          item.benchmarkValues={...(item.benchmarkValues??{}),[series.key]:point.value.toNumber()};
          byDate.set(point.date,item);
        }
      }catch{
        comparisonWarnings.push(series.label+" comparison is unavailable for part of this history because a withdrawal exceeds the counterfactual value.");
      }
    }
  }

  const chartMarkers=[
    ...externalFlows.filter((flow:any)=>String(flow.event_type)==="CONTRIBUTION").map((flow:any)=>({date:String(flow.date).slice(0,10),type:"CONTRIBUTION" as const,label:"Contribution"})),
    ...reviewEvents.map((event:any)=>({date:String(event.date).slice(0,10),type:"REVIEW" as const,label:String(event.title??"Strategy review")}))
  ];
  for(const marker of chartMarkers){
    if(!byDate.has(marker.date))byDate.set(marker.date,{date:marker.date});
  }
  const chartData=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const contributions=await sql.unsafe("SELECT id,occurred_at,cash_amount,provenance,confidence FROM ledger_events WHERE strategy_instance_id=$1 AND event_type='CONTRIBUTION' ORDER BY occurred_at DESC LIMIT 8",[id]);
  const reconciliations=await sql.unsafe("SELECT occurred_at,expected_value,broker_reported_value,difference,reason FROM reconciliations WHERE strategy_instance_id=$1 ORDER BY occurred_at DESC LIMIT 5",[id]);
  const cashEvents=await sql.unsafe("SELECT id,occurred_at,event_type,cash_amount,fee_amount,metadata FROM ledger_events WHERE strategy_instance_id=$1 AND event_type IN ('WITHDRAWAL','DIVIDEND','DISTRIBUTION','INTEREST','FEE','TAX') ORDER BY occurred_at DESC,created_at DESC LIMIT 12",[id]);
  const latestValue=actualPoints.at(-1);
  const explanation=Array.isArray(action?.explanation)?action.explanation:[];
  const needsOpeningSnapshot=Boolean(s.state?.resumeNeedsReconciliation);
  const hasVersionUpdate=Boolean(s.latest_version_id)&&String(s.latest_version_id)!==String(s.strategy_version_id);
  const isHealthy=s.health_status==="HEALTHY";
  const isActive=s.status==="ACTIVE";
  const actionReady=Boolean(action)&&isActive;
  const nextReview=action?.due_at?new Date(action.due_at):null;
  const plainReason=action?plainEnglishActionReason({actionType:String(action.action_type),instruction:String(action.instruction??"")}):null;
  const ruleRows=strategyRuleRows(String(s.engine),(s.config??{}) as Record<string,unknown>);
  const canSeeTechnicalConfig=user.role==="ADMIN"||!Boolean(s.proprietary);

  return <>
    <Link href="/app/strategies" className="back-link"><ArrowLeft size={14}/>Portfolio</Link>

    <div className="strategy-heading">
      <div>
        <div className="eyebrow">{s.strategy_name} · v{s.version}</div>
        <h1>{s.name}</h1>
        <p>{s.description}</p>
      </div>
      <div className="strategy-heading-actions">
        <span className={"pill "+(isHealthy?"good":"warn")}>{isHealthy?"On track":"Needs attention"}</span>
        {isActive&&<RecalculateButton id={id}/>}
      </div>
    </div>

    {needsOpeningSnapshot?<section className="glass resume-focus">
      <div className="resume-focus-icon"><WalletCards size={24}/></div>
      <div>
        <div className="eyebrow">One last step</div>
        <h2>Tell us what you own today.</h2>
        <p>You do not need to rebuild your old transaction history. Enter your current cash and holdings so we can calculate from here.</p>
      </div>
      <OpeningSnapshotForm id={id}/>
    </section>:<section className={"glass strategy-focus "+(isHealthy?"healthy":"attention")}>
      <div className="strategy-focus-main">
        <div className="focus-topline">
          <span className="soft-label">{isActive?"What to do now":"Strategy status"}</span>
          {action?.confidence&&<span className={"pill "+(action.confidence==="HIGH"?"good":"warn")}>{action.confidence} confidence</span>}
        </div>
        <h2>{actionReady?action.title:isActive?"Nothing to do right now.":"Strategy "+String(s.status).toLowerCase()}</h2>
        <p>{actionReady?action.instruction:isActive?"We will show your next action here as soon as the strategy needs you.":"Resume this strategy when you want new actions to be calculated."}</p>
        {actionReady&&plainReason&&<div className="plain-reason"><Sparkles size={14}/><span>{plainReason}</span></div>}
        {action&&isActive&&action.action_type!=="DATA_REQUIRED"&&action.action_type!=="NO_ACTION"&&<div className="focus-action"><ExecuteAction action={{id:String(action.id),actionType:String(action.action_type)}}/></div>}
      </div>

      <div className="strategy-focus-side">
        <div className="focus-stat">
          <span>Current value</span>
          <strong>{latestValue?money(Number(latestValue.value),s.currency):"—"}</strong>
        </div>
        <div className="focus-stat">
          <span>Next review</span>
          <strong>{nextReview?nextReview.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"When needed"}</strong>
        </div>
        <div className="focus-stat">
          <span>Account</span>
          <strong>{s.wrapper}</strong>
        </div>
      </div>

      {explanation.length>0&&<details className="focus-why">
        <summary>Why this action? <ChevronRight size={15}/></summary>
        <div>{explanation.map((row:any,i:number)=><div className="why-row" key={i}><span>{row.label}</span><b>{row.value}</b></div>)}</div>
      </details>}
    </section>}

    {!isHealthy&&!needsOpeningSnapshot&&<div className="attention-banner">
      <div><strong>We need a little more information before we can be fully confident.</strong><span>We will never guess when holdings, prices, FX or reconciliation data is uncertain.</span></div>
      <CheckCircle2 size={20}/>
    </div>}

    {hasVersionUpdate&&<StrategyVersionUpgrade id={id} currentVersion={String(s.version)} targetVersionId={String(s.latest_version_id)} targetVersion={String(s.latest_version)} releaseNotes={s.latest_release_notes?String(s.latest_release_notes):null} upgradePolicy={String(s.latest_upgrade_policy??"OPTIONAL")} inputSchema={Array.isArray(s.latest_input_schema)?s.latest_input_schema:[]} currentSettings={(s.settings??{}) as Record<string,unknown>} currentConfig={(s.config??{}) as Record<string,unknown>} targetConfig={(s.latest_config??{}) as Record<string,unknown>}/>}

    <div className="strategy-shortcuts">
      <details className="glass quick-drawer">
        <summary><span><WalletCards size={18}/>Update portfolio</span><ChevronRight size={16}/></summary>
        <div className="quick-drawer-content">
          <div className="detail-grid">
            <section><h3>Add money</h3><p className="help">Record a contribution. Cash stays cash until a purchase is confirmed.</p><ContributionForm id={id}/></section>
            <section><h3>Other cash movement</h3><p className="help">Withdrawals, dividends, interest, fees and tax belong here.</p><CashEventForm id={id}/></section>
          </div>
          <section className="drawer-section contribution-plan-settings"><h3>Regular contribution</h3><p className="help">Optional reminder only. Planned money never appears in your portfolio until you record the real deposit.</p><ContributionPlanForm id={id} plan={(s.contribution_plan??{}) as Record<string,unknown>}/></section>
          <section className="drawer-section"><h3>Match your broker</h3><p className="help">If the app and broker differ, reconcile them here. Unexplained differences block financial actions instead of being guessed.</p><ReconcileForm id={id} expected={latestValue?Number(latestValue.value):null}/></section>
        </div>
      </details>

      <details className="glass quick-drawer">
        <summary><span><BarChart3 size={18}/>Explore performance & history</span><ChevronRight size={16}/></summary>
        <div className="quick-drawer-content">
          <section className="chart-card explore-chart">
            <div className="section-head"><div><h2>Performance</h2><p>Your account versus the same cash flows applied to the strategy model and benchmark.</p></div></div>
            <PerformanceChart data={chartData} markers={chartMarkers} comparisons={comparisonSeries.map(({key,label,defaultVisible})=>({key,label,defaultVisible}))}/>
            <p className="help">Contributions and withdrawals are applied across comparison series so adding money is not mistaken for investment performance.</p>
            {comparisonWarnings.map((warning)=><p className="help comparison-warning" key={warning}>{warning}</p>)}
            <div className="tracking-boundary"><span>Tracked by StrategyOS since {new Date(s.started_at).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}.</span>{s.onboarding_mode==="RESUME"&&<span>Performance before that date is not reconstructed from incomplete history.</span>}</div>
          </section>

          <div className="detail-grid history-grid">
            <section className="drawer-section"><h3>Recent contributions</h3>{contributions.length?contributions.map((c:any)=><div className="why-row" key={String(c.id)}><span>{new Date(c.occurred_at).toLocaleDateString("en-GB")}</span><span className="inline"><b>{new Intl.NumberFormat("en-GB",{style:"currency",currency:s.currency}).format(Number(c.cash_amount))}</b><ReverseLedgerEventButton strategyId={id} eventId={String(c.id)}/></span></div>):<p className="help">No contributions recorded yet.</p>}</section>
            <section className="drawer-section"><h3>Other cash events</h3>{cashEvents.length?cashEvents.map((event:any)=><div className="why-row" key={String(event.id)}><span>{new Date(event.occurred_at).toLocaleDateString("en-GB")} · {String(event.event_type).replaceAll("_"," ")}</span><span className="inline"><b>{new Intl.NumberFormat("en-GB",{style:"currency",currency:s.currency}).format(Math.abs(Number(event.cash_amount||event.fee_amount||0)))}</b><ReverseLedgerEventButton strategyId={id} eventId={String(event.id)}/></span></div>):<p className="help">No other cash events yet.</p>}</section>
          </div>
          <section className="drawer-section"><h3>Reconciliation history</h3>{reconciliations.length?reconciliations.map((r:any,i:number)=><div className="why-row" key={i}><span>{new Date(r.occurred_at).toLocaleDateString("en-GB")} · {r.reason??"Adjustment"}</span><b>{Number(r.difference).toFixed(2)}</b></div>):<p className="help">No reconciliations yet.</p>}</section>
        </div>
      </details>

      {canWhatIf&&      <details className="glass quick-drawer">
        <summary><span><Sparkles size={18}/>What if?</span><ChevronRight size={16}/></summary>
        <div className="quick-drawer-content">
          <div className="section-head"><div><h2>Preview a change.</h2><p>See what the strategy would say without touching your real portfolio.</p></div></div>
          <WhatIfPreview id={id} currency={String(s.currency)}/>
        </div>
      </details>}

      <details className="glass quick-drawer">
        <summary><span><CalendarClock size={18}/>Strategy settings & rules</span><ChevronRight size={16}/></summary>
        <div className="quick-drawer-content">
          <div className="detail-grid">
            <section className="drawer-section"><div className="eyebrow">Strategy health</div><h3>{isHealthy?"Everything looks good":"Needs attention"}</h3><p className="help">High-confidence actions are suppressed whenever critical holdings, FX, market data or reconciliation state is stale, missing or unresolved.</p><div className="strategy-meta"><span className="pill">Version {s.version}</span><span className="pill">{s.currency}</span><span className="pill">{s.onboarding_mode.replaceAll("_"," ")}</span><span className="pill">{s.status}</span></div></section>
            <section className="drawer-section"><div className="eyebrow">Lifecycle</div><h3>Pause, resume or stop</h3><p className="help">These controls preserve your history. They never erase the journey you have already recorded.</p><StrategyLifecycleControls id={id} status={s.status}/></section>
          </div>
          <section className="drawer-section execution-settings"><div className="eyebrow">Trade preferences</div><h3>Make the strategy fit your broker.</h3><p className="help">These preferences change how an ideal strategy action is translated into a practical order. They do not change the strategy rules themselves.</p><ExecutionConstraintsForm id={id} constraints={(s.execution_constraints??{}) as Record<string,unknown>}/></section>
          <section className="drawer-section rules-section">
            <div className="eyebrow">Rules & disclosure</div>
            <h3>How this version operates</h3>
            <p>{s.disclosure}</p>
            <div className="rule-summary-grid">{ruleRows.map((row)=><div className="rule-summary-row" key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}</div>
            {canSeeTechnicalConfig?<details><summary>Show technical configuration</summary><pre>{JSON.stringify(s.config,null,2)}</pre></details>:<p className="help">The customer view shows the operational rules you need without exposing the strategy author&apos;s internal configuration format.</p>}
          </section>
        </div>
      </details>
    </div>
  </>;
}
