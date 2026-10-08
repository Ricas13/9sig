"use client";
import {useState} from "react";
export function IntegrationTests(){
 const [symbol,setSymbol]=useState("TQQQ");
 const [busy,setBusy]=useState("");
 const [results,setResults]=useState<Record<string,string>>({});
 async function run(service:"STRIPE"|"EMAIL"|"MARKET_DATA"){
  setBusy(service);
  try{
   const r=await fetch("/api/admin/operations/test-connection",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({service,...(service==="MARKET_DATA"?{symbol}: {})})});
   const v=await r.json().catch(()=>({}));
   setResults(old=>({...old,[service]:v.message??v.error??"Unable to test connection."}));
  }catch{setResults(old=>({...old,[service]:"Connection test failed."}));}
  finally{setBusy("");}
 }
 return <section className="glass form-card"><h3>Test provider connections</h3><p className="help">These actions contact configured providers. Stripe tests authentication, email sends to your own admin address, and market data requests one quote. Secrets are never returned.</p>
 {(["STRIPE","EMAIL","MARKET_DATA"] as const).map(service=><div key={service} style={{marginTop:12}}>
  <div className="why-row"><span>{service==="MARKET_DATA"?"Market data":service==="EMAIL"?"Email":"Stripe"}</span><button className="button" type="button" disabled={Boolean(busy)} onClick={()=>run(service)}>{busy===service?"Testing…":"Test connection"}</button></div>
  {service==="MARKET_DATA"&&<div className="field"><label htmlFor="test-symbol">Quote symbol</label><input id="test-symbol" value={symbol} onChange={e=>setSymbol(e.target.value)} maxLength={32}/></div>}
  {results[service]&&<p role="status" className="help">{results[service]}</p>}
 </div>)}
 </section>;
}
