"use client";
import { useState } from "react";

export function Paywall() {
  const [error,setError]=useState("");
  async function subscribe() {
    setError(""); const r=await fetch("/api/billing/checkout",{method:"POST"}); const b=await r.json();
    if(!r.ok||!b.url) return setError(b.error??"Billing unavailable");
    location.href=b.url;
  }
  return <section className="card paywall">
    <div className="brand">9Sig Journey</div><h1>$20/month</h1>
    <p className="muted">Your private 3QQQ 9Sig dashboard: what to do, where you are, what comes next.</p>
    <button className="primary" onClick={subscribe}>Start subscription</button>
    {error&&<div className="error" style={{marginTop:12}}>{error}</div>}
  </section>;
}