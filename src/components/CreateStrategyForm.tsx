"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Strategy={key:string;name:string;family:string;description:string};

export function CreateStrategyForm({strategies,baseCurrency}:{strategies:Strategy[];baseCurrency:string}) {
  const router=useRouter();const [mode,setMode]=useState<"START_NEW"|"RESUME">("START_NEW");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  return <form className="glass form-card" onSubmit={async(e)=>{
    e.preventDefault();setBusy(true);setError("");const f=new FormData(e.currentTarget);
    const response=await fetch("/api/strategies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      strategyKey:f.get("strategyKey"),name:f.get("name"),wrapper:f.get("wrapper"),broker:f.get("broker")||null,currency:f.get("currency"),onboardingMode:mode,startingCash:f.get("startingCash")||undefined,approximateValue:f.get("approximateValue")||undefined
    })});
    const body=await response.json();setBusy(false);if(!response.ok)return setError(body.error??"Could not add strategy.");router.push("/app/strategies/"+body.id);
  }}>
    <div className="form-grid">
      <div className="field full"><label>Strategy</label><select name="strategyKey" required>{strategies.map((s)=><option key={s.key} value={s.key}>{s.name} · {s.family.replaceAll("_"," ")}</option>)}</select></div>
      <div className="field"><label>Instance name</label><input name="name" placeholder="9Sig — ISA" required/></div>
      <div className="field"><label>Account wrapper</label><select name="wrapper" defaultValue="ISA"><option>ISA</option><option>SIPP</option><option>TAXABLE</option></select></div>
      <div className="field"><label>Broker (optional)</label><input name="broker" placeholder="e.g. Trading 212"/></div>
      <div className="field"><label>Currency</label><select name="currency" defaultValue={baseCurrency}><option>GBP</option><option>USD</option><option>EUR</option></select></div>
      <div className="field full"><label>Where are you starting?</label><div className="inline"><button type="button" className={"button "+(mode==="START_NEW"?"primary":"")} onClick={()=>setMode("START_NEW")}>Starting today</button><button type="button" className={"button "+(mode==="RESUME"?"primary":"")} onClick={()=>setMode("RESUME")}>Already following it</button></div></div>
      {mode==="START_NEW"?<div className="field full"><label>Starting cash / contribution</label><input name="startingCash" type="number" min="0" step="0.01" placeholder="5000"/><div className="help">Cash stays cash until a purchase is recorded or confirmed.</div></div>:
      <div className="field full"><label>Approximate current account value</label><input name="approximateValue" type="number" min="0" step="0.01" placeholder="31816"/><div className="help">Quick Resume gets you into the app now. The strategy remains low-confidence until you reconcile holdings.</div></div>}
    </div>
    {error&&<div className="error" style={{marginTop:14}}>{error}</div>}
    <div className="inline" style={{marginTop:18}}><button className="button primary" disabled={busy}>Add strategy</button><span className="help">Advanced details stay hidden until needed.</span></div>
  </form>;
}
