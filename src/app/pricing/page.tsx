import Link from "next/link";
import type {Metadata} from "next";
import {sql} from "@/lib/db";
export const dynamic="force-dynamic";
export const metadata:Metadata={
 title:"Portfolio Tracker Plans and Pricing",
 description:"Compare free and paid rules-based portfolio tracking plans, with access and limits driven by published plan settings. No hidden or invented plan prices.",
 alternates:{canonical:"/pricing"},
 openGraph:{title:"Portfolio strategy tracker pricing",description:"Compare available plan limits and pricing.",url:"/pricing"}
};
export default async function PricingPage(){
 let rows:any[]=[];
 try{rows=await sql.unsafe("SELECT slug,display_name,billing_currency,monthly_price_minor,annual_price_minor,max_active_strategies FROM plans WHERE visible=true AND archived=false ORDER BY sort_order");}catch{/* unavailable prices are not invented */}
 return <main><div className="container"><nav className="public-nav"><Link className="brand" href="/">StrategyOS</Link><Link className="button" href="/login">Sign in</Link></nav>
 <section className="section"><div className="eyebrow">Plans and billing</div><h1>Start simple. Add strategies as you need them.</h1><p>Plans define strategy limits and available notification channels. Subscription terms and prices shown below come from the platform's configured product catalogue.</p>
 <div className="pricing" style={{marginTop:24}}>{rows.length?rows.map(row=><article className="glass price" key={row.slug}>
 <h2>{row.display_name}</h2><strong>{new Intl.NumberFormat("en-GB",{style:"currency",currency:String(row.billing_currency)}).format(Number(row.monthly_price_minor)/100)}<span style={{fontSize:14}}>/mo</span></strong>
 <p>{row.max_active_strategies==null?"Unlimited active strategies":String(row.max_active_strategies)+" active strategies"}</p>
 <p className="help">Annual option: {new Intl.NumberFormat("en-GB",{style:"currency",currency:String(row.billing_currency)}).format(Number(row.annual_price_minor)/100)} per year. Final checkout determines billing terms.</p>
 <Link className="button primary" href="/register">Choose plan</Link></article>):<div className="empty" style={{gridColumn:"1/-1"}}>Current plan prices are unavailable. We won't invent a price or accept a misleading comparison.</div>}</div></section>
 <section className="section"><h2>What does a subscription provide?</h2><p>Strategy tracking and configuration access depend on your selected plan. Brokerage costs, instrument fees, and any external market-data costs are separate unless explicitly stated at checkout.</p><Link href="/faq" className="button">Pricing questions</Link></section>
 <footer className="footer"><Link href="/">Home</Link> · <Link href="/features">Features</Link> · <Link href="/strategies">Strategies</Link></footer></div></main>;
}
