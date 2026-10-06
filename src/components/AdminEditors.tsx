"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

function useAdminSubmit(url:string,method:"PUT"|"POST"="PUT"){
  const router=useRouter();const[message,setMessage]=useState("");
  async function submit(payload:unknown){
    setMessage("");
    const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const body=await response.json().catch(()=>({}));
    if(!response.ok){setMessage(body.error??"Update failed.");return false;}
    setMessage("Saved.");router.refresh();return true;
  }
  return {submit,message};
}
function json(value:string,fallback:unknown){try{return value.trim()?JSON.parse(value):fallback;}catch{throw new Error("INVALID_JSON");}}

export function PlanEditor(){
  const {submit,message}=useAdminSubmit("/api/admin/plans");
  const[error,setError]=useState("");
  return <form className="glass form-card" onSubmit={async(e)=>{e.preventDefault();setError("");const f=new FormData(e.currentTarget);try{await submit({
    slug:f.get("slug"),displayName:f.get("displayName"),description:f.get("description")??"",
    monthlyPriceMinor:Math.round(Number(f.get("monthly"))*100),annualPriceMinor:Math.round(Number(f.get("annual"))*100),annualDiscountBps:Math.round(Number(f.get("annualDiscount")||0)*100),
    currency:f.get("currency"),supportedBillingCurrencies:String(f.get("currencies")).split(",").map(x=>x.trim()).filter(Boolean),
    maxActiveStrategies:f.get("max")===""?null:Number(f.get("max")),availableStrategyKeys:String(f.get("strategies")).split(",").map(x=>x.trim()).filter(Boolean),
    stripeMonthlyPriceId:f.get("stripeMonthly")||null,stripeAnnualPriceId:f.get("stripeAnnual")||null,
    entitlements:json(String(f.get("entitlements")),{}),trialDays:Number(f.get("trial")||0),visible:Boolean(f.get("visible")),archived:Boolean(f.get("archived")),sortOrder:Number(f.get("sort")||0)
  });}catch{setError("Entitlements must be valid JSON.");}}}>
    <h3>Upsert plan</h3><div className="form-grid">
      <div className="field"><label>Slug</label><input name="slug" required placeholder="investor"/></div>
      <div className="field"><label>Display name</label><input name="displayName" required placeholder="Investor"/></div>
      <div className="field full"><label>Description</label><input name="description"/></div>
      <div className="field"><label>Monthly price</label><input name="monthly" type="number" min="0" step="0.01" required/></div>
      <div className="field"><label>Annual price</label><input name="annual" type="number" min="0" step="0.01" required/></div><div className="field"><label>Annual discount %</label><input name="annualDiscount" type="number" min="0" max="100" step="0.01" defaultValue="0"/></div>
      <div className="field"><label>Primary currency</label><input name="currency" defaultValue="GBP" maxLength={3} required/></div>
      <div className="field"><label>Supported currencies</label><input name="currencies" defaultValue="GBP" placeholder="GBP,USD,EUR"/></div>
      <div className="field"><label>Max active strategies</label><input name="max" type="number" min="1" placeholder="blank = unlimited"/></div>
      <div className="field"><label>Trial days</label><input name="trial" type="number" min="0" defaultValue="0"/></div>
      <div className="field full"><label>Available strategy keys</label><input name="strategies" placeholder="blank = all enabled strategies"/></div>
      <div className="field"><label>Stripe monthly Price ID</label><input name="stripeMonthly"/></div>
      <div className="field"><label>Stripe annual Price ID</label><input name="stripeAnnual"/></div>
      <div className="field full"><label>Entitlements JSON</label><textarea name="entitlements" rows={4} defaultValue={'{"features":[],"notificationChannels":[]}'}/></div>
      <div className="field"><label><input name="visible" type="checkbox" defaultChecked/> Visible</label></div>
      <div className="field"><label><input name="archived" type="checkbox"/> Archived</label></div>
      <div className="field"><label>Sort order</label><input name="sort" type="number" defaultValue="0"/></div>
    </div><button className="button primary" style={{marginTop:16}}>Save plan</button>{(error||message)&&<div className={error?"error":"success"}>{error||message}</div>}
  </form>;
}

export function StrategyDefinitionEditor(){
  const {submit,message}=useAdminSubmit("/api/admin/strategies","PUT");const[error,setError]=useState("");
  return <form className="glass form-card" onSubmit={async(e)=>{e.preventDefault();setError("");const f=new FormData(e.currentTarget);try{await submit({
    key:f.get("key"),name:f.get("name"),family:f.get("family"),description:f.get("description")??"",engine:f.get("engine"),
    enabled:Boolean(f.get("enabled")),proprietary:Boolean(f.get("proprietary")),defaultBenchmarkKey:f.get("benchmark")||null,
    supportedRegions:String(f.get("regions")).split(",").map(x=>x.trim()).filter(Boolean),supportedWrappers:String(f.get("wrappers")).split(",").map(x=>x.trim()).filter(Boolean),
    requiredInputs:json(String(f.get("inputs")) ,[])
  });}catch{setError("Required inputs must be valid JSON.");}}}>
    <h3>Upsert strategy definition</h3><div className="form-grid">
      <div className="field"><label>Key</label><input name="key" required/></div><div className="field"><label>Name</label><input name="name" required/></div>
      <div className="field"><label>Family</label><input name="family" required/></div><div className="field"><label>Engine</label><select name="engine"><option>VALUE_TARGET</option><option>FIXED_ALLOCATION</option></select></div>
      <div className="field full"><label>Description</label><input name="description"/></div>
      <div className="field"><label>Regions</label><input name="regions" defaultValue="GB,US,EU"/></div><div className="field"><label>Wrappers</label><input name="wrappers" defaultValue="ISA,SIPP,TAXABLE"/></div>
      <div className="field"><label>Benchmark key</label><input name="benchmark"/></div><div className="field"><label>Required inputs JSON</label><input name="inputs" defaultValue="[]"/></div>
      <div className="field"><label><input type="checkbox" name="enabled"/> Enabled</label></div><div className="field"><label><input type="checkbox" name="proprietary"/> Proprietary</label></div>
    </div><button className="button primary" style={{marginTop:16}}>Save definition</button>{(error||message)&&<div className={error?"error":"success"}>{error||message}</div>}
  </form>;
}

export function StrategyVersionEditor(){
  const {submit,message}=useAdminSubmit("/api/admin/strategies","POST");const[error,setError]=useState("");
  return <form className="glass form-card" onSubmit={async(e)=>{e.preventDefault();setError("");const f=new FormData(e.currentTarget);try{await submit({
    strategyKey:f.get("strategyKey"),version:f.get("version"),effectiveFrom:f.get("effectiveFrom"),effectiveTo:f.get("effectiveTo")||null,
    config:json(String(f.get("config")),{}),disclosure:f.get("disclosure")??""
  });}catch{setError("Configuration must be valid JSON.");}}}>
    <h3>Create immutable strategy version</h3><div className="form-grid"><div className="field"><label>Strategy key</label><input name="strategyKey" required/></div><div className="field"><label>Version</label><input name="version" placeholder="1.1" required/></div><div className="field"><label>Effective from</label><input name="effectiveFrom" type="date" required/></div><div className="field"><label>Effective to</label><input name="effectiveTo" type="date"/></div><div className="field full"><label>Config JSON</label><textarea name="config" rows={7} defaultValue="{}"/></div><div className="field full"><label>Disclosure</label><textarea name="disclosure" rows={3}/></div></div><button className="button primary" style={{marginTop:16}}>Create version</button>{(error||message)&&<div className={error?"error":"success"}>{error||message}</div>}
  </form>;
}

export function InstrumentEditor(){
  const {submit,message}=useAdminSubmit("/api/admin/instruments");
  return <div className="detail-grid"><form className="glass form-card" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);await submit({kind:"instrument",isin:f.get("isin")||null,providerInstrumentId:f.get("providerId")||null,name:f.get("name"),economicExposure:f.get("exposure"),leverage:String(f.get("leverage")),direction:"LONG",fundCurrency:f.get("fundCurrency")||null});}}><h3>Add instrument</h3><div className="stack"><div className="field"><label>Name</label><input name="name" required/></div><div className="field"><label>ISIN</label><input name="isin"/></div><div className="field"><label>Provider instrument ID</label><input name="providerId"/></div><div className="field"><label>Economic exposure</label><input name="exposure" required/></div><div className="field"><label>Leverage</label><input name="leverage" defaultValue="1.000000" required/></div><div className="field"><label>Fund currency</label><input name="fundCurrency"/></div><button className="button primary">Add instrument</button></div></form>
  <form className="glass form-card" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);await submit({kind:"mapping",economicExposure:f.get("exposure"),leverage:String(f.get("leverage")),direction:"LONG",country:f.get("country"),wrapper:f.get("wrapper"),broker:f.get("broker")||null,preferredCurrency:f.get("currency")||null,tradingLineId:f.get("tradingLineId"),fidelity:"EXACT",effectiveFrom:f.get("effectiveFrom"),effectiveTo:f.get("effectiveTo")||null,enabled:true});}}><h3>Add exact regional mapping</h3><div className="stack"><div className="field"><label>Exposure</label><input name="exposure" required/></div><div className="field"><label>Leverage</label><input name="leverage" defaultValue="1.000000" required/></div><div className="field"><label>Country</label><input name="country" defaultValue="GB" maxLength={2} required/></div><div className="field"><label>Wrapper</label><input name="wrapper" defaultValue="ISA" required/></div><div className="field"><label>Broker (optional)</label><input name="broker"/></div><div className="field"><label>Preferred currency</label><input name="currency" defaultValue="GBP"/></div><div className="field"><label>Trading line UUID</label><input name="tradingLineId" required/></div><div className="field"><label>Effective from</label><input name="effectiveFrom" type="date" required/></div><div className="field"><label>Effective to</label><input name="effectiveTo" type="date"/></div><button className="button primary">Add mapping</button></div></form>{message&&<div className="success">{message}</div>}</div>;
}

export function TradingLineEditor(){
  const {submit,message}=useAdminSubmit("/api/admin/instruments");
  return <form className="glass form-card" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);await submit({kind:"tradingLine",instrumentId:f.get("instrumentId"),ticker:f.get("ticker"),exchange:f.get("exchange"),currency:f.get("currency"),exchangeTimezone:f.get("timezone"),providerSymbol:f.get("providerSymbol")||null,effectiveFrom:f.get("effectiveFrom"),effectiveTo:f.get("effectiveTo")||null});}}><h3>Add / update trading line</h3><div className="form-grid"><div className="field"><label>Instrument UUID</label><input name="instrumentId" required/></div><div className="field"><label>Ticker</label><input name="ticker" required/></div><div className="field"><label>Exchange</label><input name="exchange" required/></div><div className="field"><label>Currency</label><input name="currency" defaultValue="GBP" required/></div><div className="field"><label>Exchange timezone</label><input name="timezone" defaultValue="Europe/London" required/></div><div className="field"><label>Provider symbol</label><input name="providerSymbol"/></div><div className="field"><label>Effective from</label><input name="effectiveFrom" type="date" required/></div><div className="field"><label>Effective to</label><input name="effectiveTo" type="date"/></div></div><button className="button primary" style={{marginTop:16}}>Save trading line</button>{message&&<div className="success">{message}</div>}</form>;
}

export function FeatureFlagEditor(){
  const {submit,message}=useAdminSubmit("/api/admin/feature-flags");const[error,setError]=useState("");
  return <form className="glass form-card" onSubmit={async(e)=>{e.preventDefault();setError("");const f=new FormData(e.currentTarget);try{await submit({key:f.get("key"),enabled:Boolean(f.get("enabled")),config:json(String(f.get("config")),{})});}catch{setError("Config must be valid JSON.");}}}><h3>Feature flag</h3><div className="form-grid"><div className="field"><label>Key</label><input name="key" required/></div><div className="field"><label><input name="enabled" type="checkbox"/> Enabled</label></div><div className="field full"><label>Config JSON</label><input name="config" defaultValue="{}"/></div></div><button className="button primary" style={{marginTop:16}}>Save flag</button>{(error||message)&&<div className={error?"error":"success"}>{error||message}</div>}</form>;
}


export function PlanPriceEditor(){
  const {submit,message}=useAdminSubmit("/api/admin/plan-prices");
  return <form className="glass form-card" onSubmit={async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);await submit({
    planSlug:f.get("planSlug"),currency:String(f.get("currency")).toUpperCase(),cadence:f.get("cadence"),
    amountMinor:Math.round(Number(f.get("amount"))*100),stripePriceId:f.get("stripePriceId")||null,active:Boolean(f.get("active"))
  });}}>
    <h3>Plan price by currency</h3><div className="form-grid">
      <div className="field"><label>Plan slug</label><input name="planSlug" placeholder="investor" required/></div>
      <div className="field"><label>Currency</label><input name="currency" defaultValue="GBP" maxLength={3} required/></div>
      <div className="field"><label>Cadence</label><select name="cadence"><option>MONTHLY</option><option>ANNUAL</option></select></div>
      <div className="field"><label>Amount</label><input name="amount" type="number" min="0" step="0.01" required/></div>
      <div className="field full"><label>Stripe Price ID</label><input name="stripePriceId" placeholder="price_..."/></div>
      <div className="field"><label><input name="active" type="checkbox" defaultChecked/> Active</label></div>
    </div><button className="button primary" style={{marginTop:16}}>Save price</button>{message&&<div className="success">{message}</div>}
  </form>;
}
