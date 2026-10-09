"use client";
import { Field } from "@/components/Field";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Limited visual builder. Creates drafts only using the already-validated API. */
type Sleeve={exposure:string;weight:string;leverage:string};
export function AllocationDraftBuilder(){
 const router=useRouter();
 const [strategyKey,setStrategyKey]=useState("");
 const [version,setVersion]=useState("1.0");
 const [effectiveFrom,setEffectiveFrom]=useState("");
 const [frequency,setFrequency]=useState("QUARTERLY");
 const [threshold,setThreshold]=useState("0.05");
 const [rows,setRows]=useState<Sleeve[]>([{exposure:"",weight:"0.60",leverage:"1"},{exposure:"",weight:"0.40",leverage:"1"}]);
 const [feedback,setFeedback]=useState("");
 const [saving,setSaving]=useState(false);
 function edit(index:number,key:keyof Sleeve,value:string){setRows(rows.map((x,i)=>i===index?{...x,[key]:value}:x));}
 async function create(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setFeedback("");
  if(!strategyKey.trim()||!version.trim()||!effectiveFrom)return setFeedback("Strategy, version and effective date are required.");
  if(rows.length<2||rows.some(r=>!r.exposure.trim()||!/^\d+(?:\.\d+)?$/.test(r.weight)||!/^\d+(?:\.\d+)?$/.test(r.leverage)||
    Number(r.weight)<=0||Number(r.weight)>1||Number(r.leverage)<=0)||new Set(rows.map(r=>r.exposure.trim())).size!==rows.length)
    return setFeedback("Add unique exposures with valid positive weights and leverage.");
  if(Math.abs(rows.reduce((v,r)=>v+Number(r.weight),0)-1)>1e-8)return setFeedback("Portfolio weights must total exactly 100%.");
  const t=Number(threshold);
  if(!Number.isFinite(t)||t<0||t>1)return setFeedback("Drift threshold must be between 0 and 1.");
  setSaving(true);
  try{
   const res=await fetch("/api/admin/strategies",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({strategyKey:strategyKey.trim(),version:version.trim(),effectiveFrom,
     engineKey:"FIXED_ALLOCATION",upgradePolicy:"OPTIONAL",inputSchema:[],
     config:{allocations:rows.map(r=>({exposure:r.exposure.trim(),weight:r.weight,leverage:r.leverage})),
      reviewFrequency:frequency,rebalanceThreshold:threshold},
     disclosure:"Rules-based portfolio calculation only. Not individual investment advice.",
     releaseNotes:"Created as unpublished allocation draft via admin builder."})
   });
   const result=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(result.error||"Could not create draft");
   setFeedback("Draft created. Review, validate and explicitly publish it in Strategy releases.");
   router.refresh();
  }catch(error){setFeedback(error instanceof Error?error.message:"Could not create draft");}
  finally{setSaving(false);}
 }
 return <form className="glass form-card" onSubmit={create}>
  <h3>Visual allocation strategy builder</h3>
  <p className="help">Create a fixed-allocation release draft without editing JSON. First create its strategy definition above. Drafts are never automatically published.</p>
  <div className="form-grid">
   <Field label="Existing strategy key"><input value={strategyKey} onChange={e=>setStrategyKey(e.target.value)} required/></Field>
   <Field label="Version"><input value={version} onChange={e=>setVersion(e.target.value)} required/></Field>
   <Field label="Effective from"><input type="date" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)} required/></Field>
   <Field label="Rebalance schedule"><select value={frequency} onChange={e=>setFrequency(e.target.value)}><option>MONTHLY</option><option>QUARTERLY</option><option>ANNUAL</option></select></Field>
   <Field label="Drift threshold (0–1)"><input value={threshold} onChange={e=>setThreshold(e.target.value)} inputMode="decimal"/></Field>
  </div>
  <h4>Target allocation</h4>
  {rows.map((row,i)=><div key={i} className="form-grid" style={{marginBottom:8}}>
   <Field label={<>Exposure {i+1}</>}><input value={row.exposure} onChange={e=>edit(i,"exposure",e.target.value)} placeholder="BROAD_EQUITY" required/></Field>
   <Field label="Weight (0–1)"><input value={row.weight} onChange={e=>edit(i,"weight",e.target.value)} inputMode="decimal" required/></Field>
   <Field label="Leverage"><input value={row.leverage} onChange={e=>edit(i,"leverage",e.target.value)} inputMode="decimal" required/></Field>
   <button className="button" type="button" disabled={rows.length<=2} onClick={()=>setRows(rows.filter((_,index)=>index!==i))}>Remove sleeve</button>
  </div>)}
  <p className="help">Current total: {(rows.reduce((v,row)=>v+(Number(row.weight)||0),0)*100).toFixed(2)}%</p>
  <button className="button" type="button" onClick={()=>setRows([...rows,{exposure:"",weight:"0",leverage:"1"}])}>Add sleeve</button>
  <button className="button primary" type="submit" disabled={saving} style={{marginLeft:8}}>{saving?"Saving…":"Create draft"}</button>
  {feedback&&<p role="status" className="help">{feedback}</p>}
 </form>;
}
