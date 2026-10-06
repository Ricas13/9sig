"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InputField={key:string;label:string;type:"text"|"number"|"date"|"select"|"boolean";required?:boolean;help?:string;default?:string|number|boolean;options?:Array<{label:string;value:string}>;min?:string|number;max?:string|number};
type Strategy={key:string;name:string;family:string;description:string;version:string;inputSchema:InputField[];supportedWrappers:string[]};

function StrategyFields({fields}:{fields:InputField[]}){
  return <>{fields.map((field)=><div className="field full" key={field.key}>
    <label>{field.label}</label>
    {field.type==="select"?<select name={"strategyInput:"+field.key} defaultValue={String(field.default??"")} required={field.required}>{!field.required&&<option value="">Not set</option>}{field.options?.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:
    field.type==="boolean"?<label><input name={"strategyInput:"+field.key} type="checkbox" defaultChecked={Boolean(field.default)}/> {field.help??field.label}</label>:
    <input name={"strategyInput:"+field.key} type={field.type} defaultValue={field.default==null?undefined:String(field.default)} required={field.required} min={field.min==null?undefined:String(field.min)} max={field.max==null?undefined:String(field.max)}/>}
    {field.help&&field.type!=="boolean"&&<div className="help">{field.help}</div>}
  </div>)}</>;
}

export function CreateStrategyForm({strategies,baseCurrency}:{strategies:Strategy[];baseCurrency:string}) {
  const router=useRouter();
  const [mode,setMode]=useState<"START_NEW"|"RESUME">("START_NEW");
  const [selectedKey,setSelectedKey]=useState(strategies[0]?.key??"");
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const selected=useMemo(()=>strategies.find((s)=>s.key===selectedKey)??strategies[0],[strategies,selectedKey]);
  const wrappers=selected?.supportedWrappers.length?selected.supportedWrappers:["ISA","SIPP","TAXABLE"];

  return <form className="glass form-card" onSubmit={async(e)=>{
    e.preventDefault();setBusy(true);setError("");const f=new FormData(e.currentTarget);
    const settings:Record<string,unknown>={};
    for(const field of selected?.inputSchema??[]){
      if(field.type==="boolean")settings[field.key]=Boolean(f.get("strategyInput:"+field.key));
      else {const value=f.get("strategyInput:"+field.key);if(value!==null&&String(value)!=="")settings[field.key]=String(value);}
    }
    const response=await fetch("/api/strategies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      strategyKey:f.get("strategyKey"),name:f.get("name"),wrapper:f.get("wrapper"),broker:f.get("broker")||null,currency:f.get("currency"),onboardingMode:mode,
      startingCash:f.get("startingCash")||undefined,approximateValue:f.get("approximateValue")||undefined,settings
    })});
    const body=await response.json();setBusy(false);if(!response.ok)return setError(body.error??"Could not add strategy.");router.push("/app/strategies/"+body.id);
  }}>
    <div className="form-grid">
      <div className="field full"><label>Strategy</label><select name="strategyKey" value={selectedKey} onChange={(e)=>setSelectedKey(e.target.value)} required>{strategies.map((s)=><option key={s.key} value={s.key}>{s.name} · v{s.version} · {s.family.replaceAll("_"," ")}</option>)}</select></div>
      <div className="field"><label>Instance name</label><input name="name" placeholder="9Sig — ISA" required/></div>
      <div className="field"><label>Account wrapper</label><select name="wrapper" key={selectedKey} defaultValue={wrappers[0]}>{wrappers.map((wrapper)=><option key={wrapper}>{wrapper}</option>)}</select></div>
      <div className="field"><label>Broker (optional)</label><input name="broker" placeholder="e.g. Trading 212"/></div>
      <div className="field"><label>Currency</label><select name="currency" defaultValue={baseCurrency}><option>GBP</option><option>USD</option><option>EUR</option></select></div>
      <StrategyFields fields={selected?.inputSchema??[]}/>
      <div className="field full"><label>Where are you starting?</label><div className="inline"><button type="button" className={"button "+(mode==="START_NEW"?"primary":"")} onClick={()=>setMode("START_NEW")}>Starting today</button><button type="button" className={"button "+(mode==="RESUME"?"primary":"")} onClick={()=>setMode("RESUME")}>Already following it</button></div></div>
      {mode==="START_NEW"?<div className="field full"><label>Starting cash / contribution</label><input name="startingCash" type="number" min="0" step="0.01" placeholder="5000"/><div className="help">Cash stays cash until a purchase is recorded or confirmed.</div></div>:
      <div className="field full"><label>Approximate current account value</label><input name="approximateValue" type="number" min="0" step="0.01" placeholder="31816"/><div className="help">Quick Resume gets you into the app now. The strategy remains low-confidence until you reconcile holdings.</div></div>}
    </div>
    {error&&<div className="error" style={{marginTop:14}}>{error}</div>}
    <div className="inline" style={{marginTop:18}}><button className="button primary" disabled={busy||!selected}>Add strategy</button><span className="help">Strategy-specific fields are defined by the published strategy version, not hard-coded into this form.</span></div>
  </form>;
}
