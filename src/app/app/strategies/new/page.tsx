import Link from "next/link";
import { ArrowLeft, ArrowRight, Crown } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { listAvailableStrategies, listUserStrategies } from "@/lib/strategy-service";
import { loadEntitlements } from "@/lib/entitlement-service";
import { CreateStrategyForm } from "@/components/CreateStrategyForm";

export default async function NewStrategyPage(){
  const user=await requirePageUser();
  const [rows,existing,entitlements]=await Promise.all([
    listAvailableStrategies(),
    listUserStrategies(user.id),
    loadEntitlements(user.id)
  ]);
  const activeCount=existing.filter((strategy:any)=>strategy.status==="ACTIVE").length;
  const atLimit=entitlements.maxActiveStrategies!==null&&activeCount>=entitlements.maxActiveStrategies;
  const allowedRows=entitlements.availableStrategyKeys
    ? rows.filter((row:any)=>entitlements.availableStrategyKeys?.has(String(row.key)))
    : rows;
  const strategies=allowedRows.map((r:any)=>({
    key:String(r.key),name:String(r.name),family:String(r.family),description:String(r.description),
    version:String(r.version),inputSchema:Array.isArray(r.input_schema)?r.input_schema:[],
    supportedWrappers:Array.isArray(r.supported_wrappers)?r.supported_wrappers.map(String):[]
  }));

  return <>
    <Link href="/app/strategies" className="back-link"><ArrowLeft size={14}/>Portfolio</Link>
    {atLimit?<section className="glass plan-limit-state">
      <div className="plan-limit-icon"><Crown size={24}/></div>
      <div className="eyebrow">{entitlements.planSlug} plan</div>
      <h1>You’re using all {entitlements.maxActiveStrategies} of your active {entitlements.maxActiveStrategies===1?"strategy":"strategies"}.</h1>
      <p>Your existing journeys stay exactly as they are. Upgrade if you want to run another strategy at the same time.</p>
      <div className="inline plan-limit-actions">
        <Link className="button primary" href="/app/settings#plan">See plan options <ArrowRight size={16}/></Link>
        <Link className="button quiet" href="/app/strategies">Back to portfolio</Link>
      </div>
    </section>:strategies.length?<CreateStrategyForm strategies={strategies} baseCurrency={user.baseCurrency}/>:<section className="glass plan-limit-state">
      <div className="eyebrow">Your plan</div><h1>No additional strategies are available on this plan.</h1>
      <p>Your current strategies are unaffected. You can review plan options to unlock additional strategy types when available.</p>
      <Link className="button primary" href="/app/settings#plan">See plan options <ArrowRight size={16}/></Link>
    </section>}
  </>;
}
