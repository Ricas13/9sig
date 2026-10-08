"use client";
import {useState} from "react";
import {calculateSimpleRebalance} from "@/domain/public-rebalance-calculator";
export function PublicRebalanceCalculator(){
 const [total,setTotal]=useState("10000");
 const [current,setCurrent]=useState("6500");
 const [targetPercent,setTargetPercent]=useState("60");
 let result:ReturnType<typeof calculateSimpleRebalance>|null=null;
 let error="";
 try{result=calculateSimpleRebalance(total,current,targetPercent)}catch{error="Enter a non-negative portfolio value, a current holding no larger than your portfolio, and a target between 0% and 100%.";}
 return <div className="glass form-card" style={{maxWidth:820}}>
  <h2>Calculate your target allocation</h2>
  <p className="help">Example: a £10,000 portfolio with £6,500 in shares and a 60% target. For a different holding, enter its current value and desired portfolio percentage.</p>
  <div className="form-grid">
   <div className="field"><label htmlFor="calc-total">Portfolio value (£)</label><input id="calc-total" inputMode="decimal" value={total} onChange={e=>setTotal(e.target.value)}/></div>
   <div className="field"><label htmlFor="calc-current">Current value of this holding (£)</label><input id="calc-current" inputMode="decimal" value={current} onChange={e=>setCurrent(e.target.value)}/></div>
   <div className="field"><label htmlFor="calc-target">Target weight (%)</label><input id="calc-target" inputMode="decimal" value={targetPercent} onChange={e=>setTargetPercent(e.target.value)}/></div>
  </div>
  {error&&<p className="error" role="alert">{error}</p>}
  {result&&<div role="status" aria-live="polite" className="why" style={{marginTop:20}}>
    <div className="why-row"><span>Target value at {result.targetPercent}%</span><b>£{result.targetValue}</b></div>
    <div className="why-row"><span>Current value</span><b>£{result.currentValue}</b></div>
    <div className="why-row"><span>Difference</span><b>£{result.delta}</b></div>
    <h3>{result.action==="HOLD"?"Already at target":result.action==="BUY"?"Illustrative buy £"+result.absoluteAmount:"Illustrative sell £"+result.absoluteAmount}</h3>
    <p className="help">This is a mechanical difference between actual and target weights, not a trade recommendation. It ignores brokerage commissions, tax, slippage, spread, currency conversion and minimum dealing sizes.</p>
  </div>}
 </div>;
}
