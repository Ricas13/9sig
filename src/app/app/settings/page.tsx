import { requirePageUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { BillingButtons,DiscordForm,PrivacyControls,SecurityControls } from "@/components/SettingsForms";
import { isMfaEnabled } from "@/lib/mfa";

export default async function SettingsPage(){
  const user=await requirePageUser();
  const mfaEnabled=await isMfaEnabled(user.id);
  const rows=await sql.unsafe(
    "SELECT p.display_name,p.slug,p.max_active_strategies,s.status,s.cadence,s.current_period_end,s.stripe_subscription_id FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 LIMIT 1",
    [user.id]
  );
  const plan=rows[0];
  const activeRows=await sql.unsafe("SELECT count(*)::int AS count FROM strategy_instances WHERE user_id=$1 AND status='ACTIVE'",[user.id]);
  const activeStrategyCount=Number(activeRows[0]?.count??0);
  const priceRows=await sql.unsafe(
    "SELECT p.slug,p.display_name,p.max_active_strategies,p.entitlements,pp.currency,pp.cadence,pp.amount_minor FROM plan_prices pp JOIN plans p ON p.id=pp.plan_id WHERE pp.active=true AND p.visible=true AND p.archived=false AND p.slug<>'free' ORDER BY p.sort_order,pp.currency,pp.cadence"
  );
  const prices=priceRows.map((p:any)=>({
    planSlug:String(p.slug),
    planName:String(p.display_name),
    currency:String(p.currency),
    cadence:String(p.cadence) as "MONTHLY"|"ANNUAL",
    amountMinor:Number(p.amount_minor),
    maxActiveStrategies:p.max_active_strategies==null?null:Number(p.max_active_strategies),
    entitlements:(p.entitlements??{}) as Record<string,unknown>
  }));
  const currentPlanSlug=String(plan?.slug??"free");
  const currentStatus=String(plan?.status??"FREE");
  const paidSubscription=Boolean(plan?.stripe_subscription_id)&&!["FREE","CANCELED"].includes(currentStatus);

  return <>
    <div className="page-title"><div><div className="eyebrow">Settings</div><h1>Keep it simple.</h1><p>Your plan, notifications, privacy and account data live here.</p></div></div>
    <div className="detail-grid settings-grid">
      <section id="plan" className="glass form-card settings-plan-card">
        <div className="settings-card-heading"><div><div className="eyebrow">Plan</div><h3>{plan?.display_name??"Free"}</h3></div><span className="pill good">{currentStatus.replaceAll("_"," ")}</span></div>
        {plan?.current_period_end&&paidSubscription&&<p className="help">Current billing period runs to {new Date(plan.current_period_end).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}.</p>}
        <BillingButtons prices={prices} defaultCurrency={user.baseCurrency} currentPlanSlug={currentPlanSlug} paidSubscription={paidSubscription} activeStrategyCount={activeStrategyCount} currentMaxActiveStrategies={plan?.max_active_strategies==null?null:Number(plan.max_active_strategies)}/>
      </section>
      <section className="glass form-card">
        <div className="eyebrow">Notifications</div><h3>Discord</h3>
        <p className="help">Add an encrypted Discord webhook if your current plan includes Discord alerts.</p>
        <DiscordForm/>
      </section>
    </div>
    <section id="security" className="card privacy-card"><div className="eyebrow">Security</div><h3>Two-step sign-in</h3><SecurityControls enabled={mfaEnabled}/></section>
    <section className="card privacy-card"><div className="eyebrow">Privacy</div><h3>Your data, your choice.</h3><p className="help">Anonymous community aggregates use privacy-thresholded derived data only. You can opt out, export your data, or close the account.</p><PrivacyControls optIn={user.anonymousAggregateOptIn}/></section>
  </>;
}
