"use client";
import { Field } from "@/components/Field";
import {useState} from "react";
import {useRouter} from "next/navigation";

type InstrumentOption={id:string;ticker:string;exchange:string;currency:string};
export function ManualPriceForm({strategyId,instruments}:{strategyId:string;instruments:InstrumentOption[]}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  if(!instruments.length)return null;
  return <form className="glass form-card" onSubmit={async(event)=>{
    event.preventDefault();setBusy(true);setMessage("");
    const data=new FormData(event.currentTarget);
    try{
      const response=await fetch("/api/strategies/"+strategyId+"/overrides",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({
          fieldKey:"market_price:"+String(data.get("instrumentId")),
          manualValue:String(data.get("manualValue")),
          observedAt:String(data.get("observedAt")),
          reason:String(data.get("reason")),
          confirmed:Boolean(data.get("confirmed"))
        })
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Could not correct price.");
      setMessage(result.recalculationPending
        ?"Price recorded, but recalculation needs attention."
        :"Price recorded and the trade instruction has been recalculated.");
      router.refresh();
    }catch(error){
      setMessage(error instanceof Error?error.message:"Could not save correction.");
    }finally{setBusy(false);}
  }}>
    <h3>Correct a current price</h3>
    <p className="help">This temporarily replaces a displayed instrument price in the valuation <strong>and</strong> trade quantity. It expires automatically, requires a timestamp and leaves an audit trail. It is not a historical broker fill.</p>
    <div className="form-grid">
      <Field className="field full" label="Instrument"><select name="instrumentId" required>{instruments.map(i=><option key={i.id} value={i.id}>{i.ticker} · {i.exchange} · {i.currency}</option>)}</select></Field>
      <Field label="Verified current price"><input name="manualValue" inputMode="decimal" placeholder="110.25" required/></Field>
      <Field label="Price observation with timezone"><input name="observedAt" placeholder="2026-10-08T14:00:00+01:00" required/></Field>
      <Field className="field full" label="Reason (at least 8 characters)"><input name="reason" minLength={8} maxLength={240} required/></Field>
      <label className="field full"><input name="confirmed" type="checkbox" required/> I have verified this price and its observation time and understand that order quantities will change.</label>
    </div>
    <button className="button primary" type="submit" disabled={busy}>{busy?"Saving…":"Apply price correction"}</button>
    {message&&<p role="status" className={message.startsWith("Price recorded")?"success":"attention-message"}>{message}</p>}
  </form>;
}
