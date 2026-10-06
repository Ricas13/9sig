import { requireUser } from "@/lib/session";
import { listAvailableStrategies } from "@/lib/strategy-service";
import { CreateStrategyForm } from "@/components/CreateStrategyForm";
export default async function NewStrategyPage(){const user=await requireUser();const rows=await listAvailableStrategies();const strategies=rows.map((r:any)=>({key:String(r.key),name:String(r.name),family:String(r.family),description:String(r.description)}));return <><div className="page-title"><div><div className="eyebrow">Add Strategy</div><h1>Start or resume.</h1><p>Choose a strategy yourself; the software manages the implementation from there.</p></div></div><CreateStrategyForm strategies={strategies} baseCurrency={user.baseCurrency}/></>;}
