"use client";
import { useState } from "react";

export function DiscordForm() {
  const [message,setMessage]=useState("");
  return <form className="stack" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const r=await fetch("/api/settings/discord",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({webhook:f.get("webhook")})});const b=await r.json();setMessage(r.ok?"Discord webhook saved.":b.error);}}>
    <div className="field"><label>Discord webhook</label><input name="webhook" type="url" placeholder="https://discord.com/api/webhooks/..." required/></div><button className="button">Save Discord webhook</button>{message&&<div className={message.startsWith("Discord webhook saved")?"success":"error"}>{message}</div>}
  </form>;
}
export function BillingButtons() {
  const [error,setError]=useState("");
  async function checkout(planSlug:string,cadence:string){const r=await fetch("/api/billing/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({planSlug,cadence})});const b=await r.json();if(b.url)location.href=b.url;else setError(b.error);}
  async function portal(){const r=await fetch("/api/billing/portal",{method:"POST"});const b=await r.json();if(b.url)location.href=b.url;else setError(b.error);}
  return <div><div className="inline"><button className="button primary" onClick={()=>checkout("investor","monthly")}>Investor £9.99/mo</button><button className="button primary" onClick={()=>checkout("pro","monthly")}>Pro £29.99/mo</button><button className="button" onClick={portal}>Manage billing</button></div>{error&&<div className="error" style={{marginTop:10}}>{error}</div>}</div>;
}
