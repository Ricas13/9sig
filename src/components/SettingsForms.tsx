"use client";
import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";

export function DiscordForm(){const[message,setMessage]=useState("");return <form className="stack" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const r=await fetch("/api/settings/discord",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({webhook:f.get("webhook")})});const b=await r.json();setMessage(r.ok?"Discord webhook saved.":b.error);}}><div className="field"><label>Discord webhook</label><input name="webhook" type="url" placeholder="https://discord.com/api/webhooks/..." required/></div><button className="button">Save Discord webhook</button>{message&&<div className={message.startsWith("Discord webhook saved")?"success":"error"}>{message}</div>}</form>;}

type BillingPrice={planSlug:string;planName:string;currency:string;cadence:"MONTHLY"|"ANNUAL";amountMinor:number};
export function BillingButtons({prices,defaultCurrency}:{prices:BillingPrice[];defaultCurrency:string}){
  const currencies=useMemo(()=>[...new Set(prices.map(p=>p.currency))],[prices]);
  const[currency,setCurrency]=useState(currencies.includes(defaultCurrency)?defaultCurrency:(currencies[0]??defaultCurrency));
  const[error,setError]=useState("");
  async function checkout(planSlug:string,cadence:"monthly"|"annual"){
    const r=await fetch("/api/billing/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({planSlug,cadence,currency})});
    const b=await r.json();if(b.url)location.href=b.url;else setError(b.error);
  }
  async function portal(){const r=await fetch("/api/billing/portal",{method:"POST"});const b=await r.json();if(b.url)location.href=b.url;else setError(b.error);}
  const visible=prices.filter(p=>p.currency===currency);
  return <div className="stack">
    {currencies.length>1&&<div className="field"><label>Billing currency</label><select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></div>}
    <div className="inline">{visible.map(p=><button className={p.cadence==="MONTHLY"?"button primary":"button"} key={p.planSlug+p.cadence} onClick={()=>checkout(p.planSlug,p.cadence==="MONTHLY"?"monthly":"annual")}>{p.planName} {new Intl.NumberFormat("en-GB",{style:"currency",currency:p.currency}).format(p.amountMinor/100)}/{p.cadence==="MONTHLY"?"mo":"yr"}</button>)}<button className="button" onClick={portal}>Manage billing</button></div>
    {error&&<div className="error">{error}</div>}
  </div>;
}
export function PrivacyControls({optIn}:{optIn:boolean}){const[state,setState]=useState(optIn);const[message,setMessage]=useState("");async function toggle(){const next=!state;const r=await fetch("/api/account/privacy",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({anonymousAggregateOptIn:next})});if(r.ok){setState(next);setMessage("Privacy preference updated.");}else setMessage("Could not update preference.");}async function remove(){if(!confirm("Permanently delete your account and financial history from the application?"))return;const r=await fetch("/api/account/delete",{method:"DELETE"});if(r.ok)await signOut({callbackUrl:"/"});else setMessage("Could not delete account.");}return <div className="stack"><div className="inline"><button className="button" onClick={toggle}>{state?"Opt out of anonymous aggregates":"Opt in to anonymous aggregates"}</button><a className="button" href="/api/account/export">Export my data</a></div><button className="button danger" onClick={remove}>Delete account</button>{message&&<div className={message.startsWith("Privacy")?"success":"error"}>{message}</div>}</div>;}
