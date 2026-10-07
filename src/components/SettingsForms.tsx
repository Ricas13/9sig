"use client";
import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";

export function DiscordForm(){const[message,setMessage]=useState("");return <form className="stack" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const r=await fetch("/api/settings/discord",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({webhook:f.get("webhook")})});const b=await r.json();setMessage(r.ok?"Discord webhook saved.":b.error);}}><div className="field"><label>Discord webhook</label><input name="webhook" type="url" placeholder="https://discord.com/api/webhooks/..." required/></div><button className="button">Save Discord webhook</button>{message&&<div className={message.startsWith("Discord webhook saved")?"success":"error"}>{message}</div>}</form>;}

type BillingPrice={
  planSlug:string;planName:string;currency:string;cadence:"MONTHLY"|"ANNUAL";amountMinor:number;
  maxActiveStrategies:number|null;entitlements:Record<string,unknown>;
};
function planSummary(prices:BillingPrice[],slug:string,currency:string){
  const rows=prices.filter((price)=>price.planSlug===slug&&price.currency===currency);
  const monthly=rows.find((price)=>price.cadence==="MONTHLY");
  const annual=rows.find((price)=>price.cadence==="ANNUAL");
  return {monthly,annual,meta:monthly??annual};
}
export function BillingButtons({
  prices,defaultCurrency,currentPlanSlug,paidSubscription,activeStrategyCount,currentMaxActiveStrategies
}:{
  prices:BillingPrice[];
  defaultCurrency:string;
  currentPlanSlug:string;
  paidSubscription:boolean;
  activeStrategyCount:number;
  currentMaxActiveStrategies:number|null;
}){
  const currencies=useMemo(()=>[...new Set(prices.map(p=>p.currency))],[prices]);
  const[currency,setCurrency]=useState(currencies.includes(defaultCurrency)?defaultCurrency:(currencies[0]??defaultCurrency));
  const[busy,setBusy]=useState("");
  const[error,setError]=useState("");

  async function checkout(planSlug:string,cadence:"monthly"|"annual"){
    setBusy(planSlug+cadence);setError("");
    const r=await fetch("/api/billing/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({planSlug,cadence,currency})});
    const b=await r.json();setBusy("");
    if(b.url)window.location.assign(b.url);else setError(b.error);
  }
  async function portal(){
    setBusy("portal");setError("");
    const r=await fetch("/api/billing/portal",{method:"POST"});
    const b=await r.json();setBusy("");
    if(b.url)window.location.assign(b.url);else setError(b.error);
  }

  if(paidSubscription)return <div className="billing-current">
    <div className="billing-usage">
      <span>Active strategies</span>
      <strong>{activeStrategyCount}{currentMaxActiveStrategies==null?"":" / "+currentMaxActiveStrategies}</strong>
    </div>
    <p>You’re on <strong>{currentPlanSlug}</strong>. Change plan, billing cycle or payment details in one place.</p>
    <div className="billing-impact-note">
      <strong>Changing to a smaller plan is safe.</strong>
      <span>If the new plan allows fewer active strategies — or removes a feature an active strategy depends on, such as multiple linked accounts — affected strategies are paused automatically. Their history is preserved and can be resumed later when your plan allows it.</span>
    </div>
    <button className="button primary" disabled={Boolean(busy)} onClick={portal}>{busy==="portal"?"Opening…":"Manage billing"}</button>
    {error&&<div className="error" role="alert">{error}</div>}
  </div>;

  const slugs=[...new Set(prices.map((price)=>price.planSlug))];
  return <div className="stack billing-options">
    {currencies.length>1&&<div className="field compact-field"><label>Billing currency</label><select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></div>}
    <div className="billing-plan-grid">
      {slugs.map((slug)=>{
        const plan=planSummary(prices,slug,currency);
        if(!plan.meta)return null;
        const limit=plan.meta.maxActiveStrategies==null?"Unlimited active strategies":"Up to "+plan.meta.maxActiveStrategies+" active "+(plan.meta.maxActiveStrategies===1?"strategy":"strategies");
        const raw=plan.meta.entitlements&&typeof plan.meta.entitlements==="object"?plan.meta.entitlements:{};
        const channels=Array.isArray(raw.notificationChannels)?raw.notificationChannels.filter((value):value is string=>typeof value==="string"):[];
        return <div className={"billing-plan "+(slug==="pro"?"featured":"")} key={slug}>
          <div><span className="billing-plan-name">{plan.meta.planName}</span>{slug==="pro"&&<span className="pill good">MOST FLEXIBLE</span>}</div>
          <strong>{plan.monthly?new Intl.NumberFormat("en-GB",{style:"currency",currency}).format(plan.monthly.amountMinor/100)+"/mo":"Paid plan"}</strong>
          <p>{limit}{channels.length?" · "+channels.map((channel)=>channel[0]+channel.slice(1).toLowerCase()).join(" + ")+" alerts":""}</p>
          <div className="billing-plan-actions">
            {plan.monthly&&<button className="button primary" disabled={Boolean(busy)} onClick={()=>checkout(slug,"monthly")}>{busy===slug+"monthly"?"Opening…":"Choose monthly"}</button>}
            {plan.annual&&<button className="button" disabled={Boolean(busy)} onClick={()=>checkout(slug,"annual")}>{busy===slug+"annual"?"Opening…":"Annual · "+new Intl.NumberFormat("en-GB",{style:"currency",currency,maximumFractionDigits:0}).format(plan.annual.amountMinor/100)}</button>}
          </div>
        </div>;
      })}
    </div>
    {currentPlanSlug==="free"&&<p className="help">Your Free plan keeps working if you do nothing. Upgrading only changes the limits and features available to your account. Nothing changes until checkout completes successfully.</p>}
    {error&&<div className="error">{error}</div>}
  </div>;
}

export function PrivacyControls({optIn}:{optIn:boolean}){const[state,setState]=useState(optIn);const[message,setMessage]=useState("");async function toggle(){const next=!state;const r=await fetch("/api/account/privacy",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({anonymousAggregateOptIn:next})});if(r.ok){setState(next);setMessage("Privacy preference updated.");}else setMessage("Could not update preference.");}async function remove(){if(!confirm("Permanently delete your account and financial history from the application?"))return;const r=await fetch("/api/account/delete",{method:"DELETE"});if(r.ok)await signOut({callbackUrl:"/"});else setMessage("Could not delete account.");}return <div className="stack"><div className="inline"><button className="button" onClick={toggle}>{state?"Opt out of anonymous aggregates":"Opt in to anonymous aggregates"}</button><a className="button" href="/api/account/export">Export my data</a></div><button className="button danger" onClick={remove}>Delete account</button>{message&&<div className={message.startsWith("Privacy")?"success":"error"}>{message}</div>}</div>;}
