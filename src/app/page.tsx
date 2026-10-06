import Link from "next/link";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let aggregates: any[] = [];
  let plans: any[] = [];

  try {
    aggregates = await sql.unsafe(
      "SELECT d.name,a.metric_key,a.value,a.sample_size,a.as_of_date FROM anonymous_aggregates a JOIN strategy_definitions d ON d.id=a.strategy_definition_id WHERE a.sample_size>=20 AND a.as_of_date=(SELECT max(as_of_date) FROM anonymous_aggregates) ORDER BY d.name,a.metric_key LIMIT 24"
    );
    plans = await sql.unsafe(
      "SELECT p.slug,p.display_name,p.billing_currency,COALESCE(pp.amount_minor,p.monthly_price_minor) AS monthly_price_minor,p.max_active_strategies,p.entitlements FROM plans p LEFT JOIN plan_prices pp ON pp.plan_id=p.id AND pp.currency=p.billing_currency AND pp.cadence='MONTHLY' AND pp.active=true WHERE p.visible=true AND p.archived=false ORDER BY p.sort_order"
    );
  } catch {
    // Public financial/community data fails closed instead of rendering cached or invented values.
  }

  return <main>
    <div className="container">
      <nav className="public-nav">
        <Link href="/" className="brand"><span className="brand-mark"/>StrategyOS</Link>
        <div className="nav-actions">
          <Link className="button" href="/demo">Explore demo</Link>
          <Link className="button" href="/login">Sign in</Link>
          <Link className="button primary" href="/register">Start free</Link>
        </div>
      </nav>

      <section className="hero">
        <div>
          <div className="eyebrow">Rules-based investing, operationalised</div>
          <h1>Know where you are. Know what comes next.</h1>
          <p>Track the strategy you chose, reconcile it to reality, and turn complex rules into a transparent action queue. StrategyOS does not choose a strategy for you—it operates the rules you selected.</p>
          <div className="inline" style={{marginTop:24}}>
            <Link className="button primary" href="/register">Add your first strategy</Link>
            <Link className="button" href="/demo">See fictional example</Link>
          </div>
        </div>
        <div className="hero-card">
          <div className="pill good">EXAMPLE · Action required</div>
          <h3 style={{fontSize:28,margin:"18px 0 8px"}}>9Sig — ISA</h3>
          <div style={{fontSize:38,fontWeight:850,letterSpacing:"-.05em"}}>Buy £842</div>
          <p>Fictional example only. A real action is accompanied by the exact inputs and rule calculation that generated it.</p>
          <div className="kpi-grid">
            <div className="kpi"><span>Health</span><strong>Healthy</strong></div>
            <div className="kpi"><span>Review</span><strong>Today</strong></div>
            <div className="kpi"><span>Confidence</span><strong>High</strong></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><div>
          <h2>Community signal, without exposing people.</h2>
          <p>Only privacy-thresholded aggregate statistics are publishable. Closed and paused cohorts remain in history to reduce survivorship bias.</p>
        </div></div>
        {aggregates.length
          ? <div className="cards">{aggregates.slice(0,6).map((a,i)=><div className="card" key={i}>
              <div className="pill">{a.name}</div>
              <h3 style={{marginTop:16}}>{String(a.metric_key).replaceAll("_"," ")}</h3>
              <div style={{fontSize:30,fontWeight:850}}>{Number(a.value).toFixed(2)}</div>
              <p>Aggregate cohort · n={a.sample_size}</p>
            </div>)}</div>
          : <div className="empty">There is not yet enough privacy-qualified community data to publish. We do not fill this space with fake live statistics.</div>}
      </section>

      <section className="section">
        <div className="section-head"><div>
          <h2>Plans that scale with complexity.</h2>
          <p>Limits and feature access come from server-side entitlements, not hard-coded UI checks.</p>
        </div></div>
        <div className="pricing">
          {plans.length
            ? plans.map((p:any)=><div className="glass price" key={p.slug}>
                <div className="eyebrow">{p.display_name}</div>
                <strong>
                  {new Intl.NumberFormat("en-GB",{
                    style:"currency",
                    currency:String(p.billing_currency),
                    minimumFractionDigits:Number(p.monthly_price_minor)===0?0:2
                  }).format(Number(p.monthly_price_minor)/100)}
                  <span style={{fontSize:14,color:"var(--muted)"}}>/mo</span>
                </strong>
                <p>{p.max_active_strategies==null
                  ? "Unlimited active strategy instances"
                  : p.max_active_strategies+" active strategy instance"+(p.max_active_strategies===1?"":"s")}</p>
                <Link className="button primary" href="/register">Choose {p.display_name}</Link>
              </div>)
            : <div className="empty" style={{gridColumn:"1/-1"}}>Plan pricing is temporarily unavailable. We do not display cached or invented prices.</div>}
        </div>
      </section>

      <footer className="footer">
        StrategyOS is a strategy tracking and rule-calculation tool. It does not assess suitability or recommend which strategy you should choose. Jurisdiction-specific disclosures and regulatory controls must be configured before public launch.
      </footer>
    </div>
  </main>;
}
