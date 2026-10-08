"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";

type Account={id:string;name:string;currency:string;wrapper:string};
export function BrokerTradeForm({strategyId,accounts}:{strategyId:string;accounts:Account[]}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [side,setSide]=useState<"BUY"|"SELL">("BUY");
  const [unitPrice,setUnitPrice]=useState("");
  const [quoteNotice,setQuoteNotice]=useState("");
  const key=useRef<string|null>(null);
  if(!accounts.length)return null;
  return <form className="glass form-card" onSubmit={async(event)=>{
    event.preventDefault();
    setBusy(true);setMessage("");
    const form=event.currentTarget;
    const data=new FormData(form);
    const requestKey=key.current??crypto.randomUUID();
    key.current=requestKey;
    try{
      const response=await fetch("/api/strategies/"+strategyId+"/trades",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({
          accountId:String(data.get("accountId")),ticker:String(data.get("ticker")).trim().toUpperCase(),
          exchange:String(data.get("exchange")).trim().toUpperCase(),
          executedAt:String(data.get("executedAt")).trim(),side,
          quantity:String(data.get("quantity")),unitPrice:String(data.get("unitPrice")),
          fee:String(data.get("fee")||"0"),note:String(data.get("note")||""),
          brokerFillConfirmed:Boolean(data.get("confirmed")),requestKey
        })
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Trade not recorded.");
      key.current=null;
      setMessage(result.recalculationPending
        ?"Broker fill recorded. Recalculation needs attention."
        :result.duplicate?"This broker fill was already recorded.":"Broker fill recorded in your ledger.");
      form.reset();
      setUnitPrice("");
      setQuoteNotice("");
      router.refresh();
    }catch(error){
      setMessage(error instanceof Error?error.message:"Connection interrupted; retry without changing the form.");
    }finally{setBusy(false);}
  }}>
    <h3>Record a broker trade</h3>
    <p className="help">For past purchases or sales, use the price and quantity on your actual broker confirmation, not the market-price estimate above. A trade will only be accepted if its historical cash and holdings balance. Add the corresponding dated contribution first if necessary.</p>
    <div className="form-grid">
      <div className="field"><label>Account</label><select name="accountId" required>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></div>
      <div className="field"><label>Trade type</label><select value={side} onChange={e=>setSide(e.target.value as "BUY"|"SELL")}><option value="BUY">Buy</option><option value="SELL">Sell</option></select></div>
      <div className="field"><label>Ticker</label><input name="ticker" placeholder="TQQQ" maxLength={24} required/></div>
      <div className="field"><label>Exchange</label><input name="exchange" placeholder="NASDAQ or LSE" maxLength={24} required/></div>
      <div className="field full"><label>Actual execution time with timezone offset</label><input name="executedAt" placeholder="2026-11-02T14:00:00-05:00" required/></div>
      <div className="field"><label>Executed quantity</label><input name="quantity" inputMode="decimal" placeholder="5" required/></div>
      <div className="field"><label>Broker fill price per unit</label><input name="unitPrice" inputMode="decimal" placeholder="100.12" value={unitPrice} onChange={event=>setUnitPrice(event.target.value)} required/></div>
      <div className="field full">
        <button type="button" className="button" onClick={async event=>{
          setQuoteNotice("Looking up an indicative reference…");
          const form=event.currentTarget.closest("form");
          if(!form)return;
          const input=new FormData(form);
          try{
            const response=await fetch("/api/market/historical",{
              method:"POST",headers:{"content-type":"application/json"},
              body:JSON.stringify({
                accountId:String(input.get("accountId")),
                ticker:String(input.get("ticker")).trim().toUpperCase(),
                exchange:String(input.get("exchange")).trim().toUpperCase(),
                executedAt:String(input.get("executedAt")).trim()
              })
            });
            const quote=await response.json().catch(()=>({}));
            if(!response.ok)throw new Error(quote.error||"No historical quote is available.");
            setUnitPrice(String(quote.price));
            setQuoteNotice("Indicative "+String(quote.granularity)+" "+String(quote.priceKind)+" from "+String(quote.source)+
              " at "+String(quote.observedAt)+". This is NOT an executed broker fill. Confirm and correct from your broker.");
          }catch(error){
            setQuoteNotice(error instanceof Error?error.message:"No reference quote is available. Enter the broker fill manually.");
          }
        }}>Look up indicative price</button>
        {quoteNotice&&<p className="help" role="status">{quoteNotice}</p>}
      </div>
      <div className="field"><label>Fee in account currency</label><input name="fee" inputMode="decimal" defaultValue="0" required/></div>
      <div className="field full"><label>Note (optional)</label><input name="note" maxLength={240}/></div>
      <label className="field full"><input name="confirmed" type="checkbox" required/> I confirm this price, quantity, currency and timestamp came from my broker fill, not an indicative quote.</label>
    </div>
    <button type="submit" disabled={busy} className="button primary">{busy?"Recording…":"Record broker fill"}</button>
    {message&&<p role="status" className={message.includes("recorded")?"success":"attention-message"}>{message}</p>}
  </form>;
}
