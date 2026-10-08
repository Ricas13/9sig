"use client";
import {useState} from "react";
type Account={id:string;name:string;currency:string;wrapper:string};
type Quote={price:string;currency:string;observedAt:string;granularity:string;priceKind:string;note:string;source:string};
export function HistoricalQuoteLookup({accounts}:{accounts:Account[]}){
 const [accountId,setAccountId]=useState(accounts[0]?.id??"");
 const [ticker,setTicker]=useState("");
 const [exchange,setExchange]=useState("");
 const [executedAt,setExecutedAt]=useState("");
 const [quote,setQuote]=useState<Quote|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 if(!accounts.length)return null;
 return <form className="glass form-card" onSubmit={async(event)=>{
  event.preventDefault();setQuote(null);setError("");setBusy(true);
  try{
   const response=await fetch("/api/market/historical",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({accountId,ticker:ticker.trim().toUpperCase(),exchange:exchange.trim().toUpperCase(),executedAt:executedAt.trim()})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"Historical quote unavailable.");
   setQuote(result as Quote);
  }catch(e){setError(e instanceof Error?e.message:"Could not load historical quote.");}
  finally{setBusy(false);}
 }}>
  <h3>Historical price reference</h3>
  <p className="help">Enter the exact trade date and exchange. Provide a timezone offset, for example 2026-11-02T14:00:00-05:00 for New York at 2 PM EST. Price references do not replace your broker confirmation.</p>
  <div className="form-grid">
   <div className="field"><label htmlFor="quote-account">Account</label><select id="quote-account" value={accountId} onChange={e=>setAccountId(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></div>
   <div className="field"><label htmlFor="quote-ticker">Ticker</label><input id="quote-ticker" value={ticker} onChange={e=>setTicker(e.target.value)} placeholder="TQQQ" maxLength={24} required/></div>
   <div className="field"><label htmlFor="quote-exchange">Exchange</label><input id="quote-exchange" value={exchange} onChange={e=>setExchange(e.target.value)} placeholder="NASDAQ" maxLength={24} required/></div>
   <div className="field"><label htmlFor="quote-time">Timestamp with timezone offset</label><input id="quote-time" value={executedAt} onChange={e=>setExecutedAt(e.target.value)} placeholder="2026-11-02T14:00:00-05:00" required/></div>
  </div>
  <button type="submit" disabled={busy} className="button primary" style={{marginTop:12}}>{busy?"Looking up…":"Look up market price"}</button>
  {error&&<p className="error" role="alert">{error}</p>}
  {quote&&<div role="status" className="why" aria-live="polite"><div className="why-row"><span>Price observation</span><b>{quote.price} {quote.currency}</b></div>
   <div className="why-row"><span>Recorded by provider</span><b>{new Date(quote.observedAt).toLocaleString("en-GB")}</b></div>
   <div className="why-row"><span>Resolution</span><b>{quote.granularity} · {quote.priceKind}</b></div>
   <p className="help">{quote.note}. Copy the number only if it matches your actual broker fill; record commissions and fees separately.</p>
  </div>}
 </form>;
}
