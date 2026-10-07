import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listUserStrategies } from "@/lib/strategy-service";

function strategyCardState(strategy:any){
  const status=String(strategy.status);
  if(status==="CLOSED")return {className:"attention",label:"Closed history"};
  if(status==="PAUSED")return {className:"attention",label:"Paused"};
  return strategy.health_status==="HEALTHY"
    ?{className:"healthy",label:"On track"}
    :{className:"attention",label:"Needs attention"};
}

export default async function StrategiesPage(){
  const user=await requireUser();
  const rows=await listUserStrategies(user.id);
  return <>
    <div className="page-title">
      <div><div className="eyebrow">Portfolio</div><h1>Your strategies.</h1><p>Each strategy is its own journey. Open one when you need more detail.</p></div>
      <Link className="button primary" href="/app/strategies/new"><Plus size={16}/>Add strategy</Link>
    </div>
    <div className="strategy-grid">
      {rows.map((s:any)=>{const cardState=strategyCardState(s);return <Link href={"/app/strategies/"+s.id} className="card strategy-card premium-card" key={s.id}>
        <div className="strategy-card-top"><span className={"status-light "+cardState.className}/><span>{cardState.label}</span></div>
        <h3>{s.name}</h3>
        <p>{s.strategy_name} · {s.wrapper}</p>
        <div className="strategy-meta"><span className="pill">v{s.version}</span><span className="pill">{s.currency}</span>{s.broker_name&&<span className="pill">{s.broker_name}</span>}<span className="pill">{String(s.status).toLowerCase()}</span></div>
        <span className="card-arrow"><ArrowRight size={17}/></span>
      </Link>})}
    </div>
    {!rows.length&&<div className="empty portfolio-empty"><p>You do not have a strategy yet.</p><Link className="button primary" href="/app/strategies/new"><Plus size={16}/>Start my first strategy</Link></div>}
  </>;
}