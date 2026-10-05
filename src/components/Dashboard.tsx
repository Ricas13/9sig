"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GrowthChart } from "@/components/GrowthChart";
import type { ChartPoint } from "@/lib/benchmarks";
import type { StrategyState } from "@/lib/strategy";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

export function Dashboard({ state, chart, recent, discordEnabled, billingEnabled }: {
  state: StrategyState;
  chart: ChartPoint[];
  recent: Array<{ date: string; eventType: string; action: string; contributionAmount: number; note: string | null }>;
  discordEnabled: boolean;
  billingEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function post(url: string, body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Something went wrong");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }
  const mode = state.thirtyDownActive ? `30-Down · ${state.thirtyDownSkippedSells}/2 sells skipped` : "Normal mode";
  const badgeClass = state.action === "DO_NOTHING" ? "badge good" : state.action.includes("RESET") || state.action === "SELL" ? "badge danger" : "badge warn";

  return <>
    <section className="card action-card">
      <div className={badgeClass}>{mode}</div>
      <div className="action-kicker" style={{ marginTop: 16 }}>What do I do?</div>
      <h1 className="action-title">{state.headline}</h1>
      <p className="action-copy">{state.instruction}</p>
      <ActionForm state={state} busy={busy} post={post} />
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="stats">
        <Stat label="Portfolio" value={gbp.format(state.totalValue)} />
        <Stat label="3QQQ" value={gbp.format(state.growthValue)} />
        <Stat label="CSH2" value={gbp.format(state.reserveValue)} />
        <Stat label="Next contribution" value={state.nextContributionDate ?? "—"} />
        <Stat label="Next signal" value={state.nextSignalDate ?? "—"} />
      </div>
      <div className="inline-actions muted" style={{ fontSize: 12 }}>
        <span>3QQQ {pct.format(state.growthAllocation)}</span>
        <span>Next target {state.nextTarget == null ? "—" : gbp.format(state.nextTarget)}</span>
        <span>Prices: 3QQQ {state.growthPriceAsOf ?? "manual"} · CSH2 {state.reservePriceAsOf ?? "manual"}</span>
      </div>
    </section>

    <section className="card section">
      <div className="section-head">
        <div><h2>Your growth</h2><div className="muted" style={{ fontSize: 12 }}>Same starting capital and the same DCA cash, three different journeys.</div></div>
        <div className="summary">
          <div><span>Contributed</span><b>{gbp.format(state.contributed)}</b></div>
          <div><span>9Sig value</span><b>{gbp.format(state.totalValue)}</b></div>
          <div><span>Investment gain</span><b>{gbp.format(state.investmentGain)}</b></div>
        </div>
      </div>
      <GrowthChart data={chart} />
    </section>

    <section className="card section">
      <h2 style={{ marginBottom: 12 }}>Recent actions</h2>
      <ul className="activity">
        {recent.length ? recent.map((item, i) => <li key={`${item.date}-${i}`}><time>{item.date}</time><div><b>{friendly(item.action)}</b>{item.contributionAmount > 0 ? ` · ${gbp.format(item.contributionAmount)}` : ""}<div className="muted" style={{ fontSize: 12 }}>{item.note ?? item.eventType}</div></div></li>) : <li><span /><div className="muted">Your actions will appear here.</div></li>}
      </ul>

      <details>
        <summary>Portfolio doesn't match the broker?</summary>
        <p className="muted">Reconcile it here. Exact values win over the calculated holdings from this point onward.</p>
        <ReconcileForm busy={busy} post={post} />
      </details>


      {billingEnabled && <details>
        <summary>Account & billing</summary>
        <p className="muted">Manage the card, invoices or cancellation through Stripe's secure customer portal.</p>
        <BillingButton />
      </details>}

      <details>
        <summary>Discord rebalance alert {discordEnabled ? "✓" : ""}</summary>
        <p className="muted">Add a private Discord webhook. The server sends one alert on a signal day; the URL is encrypted at rest.</p>
        <DiscordForm busy={busy} post={post} />
      </details>
    </section>

    <section className="card section">
      <h2>Rules</h2>
      <ol className="rule-list">
        <li>Start/reset at 60% 3QQQ and 40% CSH2.</li>
        <li>Every monthly contribution goes into CSH2 first.</li>
        <li>On a quarterly signal, follow the BUY / SELL / HOLD instruction above.</li>
        <li>One buy can use at most 90% of CSH2.</li>
        <li>30-Down: buys continue; skip the next two sell signals; then reset to 60/40 on the following sell.</li>
        <li>If the spike-reset conditions fire, reset to 60/40.</li>
        <li>Otherwise, do nothing.</li>
      </ol>
      <details><summary>Show the calculation</summary><p className="muted">Next 3QQQ target = previous signal target × 1.09 + 50% of contributions since the previous signal. 60/40 is a starting/reset allocation, not a normal rebalance target.</p></details>
      <p className="footnote">Tracking/education tool only. It does not connect to or place trades with a broker. Market data may be delayed or unavailable; if data is uncertain the app asks you to confirm it instead of creating a trade from a guessed price. Independent project; not affiliated with Jason Kelly or The Kelly Letter.</p>
    </section>
  </>;
}

function ActionForm({ state, busy, post }: { state: StrategyState; busy: boolean; post: (url: string, body: Record<string, unknown>) => Promise<void> }) {
  if (state.action === "DO_NOTHING") return null;
  if (state.action === "PRICE_REQUIRED") return <PriceForm busy={busy} post={post} />;
  if (state.action === "ADD_CONTRIBUTION") return <form className="form-row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); post("/api/portfolio/contribution", { amount: Number(f.get("amount")), reservePrice: Number(f.get("reservePrice")) || undefined }); }}>
    <div className="field"><label>Contribution</label><input name="amount" type="number" step="0.01" defaultValue={state.actionAmount} required /></div>
    <div className="field"><label>CSH2 execution price (£)</label><input name="reservePrice" type="number" step="0.0001" defaultValue={state.reservePrice ?? ""} /></div>
    <div className="inline-actions"><button className="primary" disabled={busy}>Confirm contribution</button></div>
  </form>;
  return <form className="form-row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); post("/api/portfolio/action", { growthPrice: Number(f.get("growthPrice")) || undefined, reservePrice: Number(f.get("reservePrice")) || undefined }); }}>
    <div className="field"><label>3QQQ execution price (£)</label><input name="growthPrice" type="number" step="0.0001" defaultValue={state.growthPrice ?? ""} /></div>
    <div className="field"><label>CSH2 execution price (£)</label><input name="reservePrice" type="number" step="0.0001" defaultValue={state.reservePrice ?? ""} /></div>
    <div className="inline-actions"><button className="primary" disabled={busy}>{state.action === "HOLD" || state.action === "SKIP_SELL" ? "Confirm signal" : "Mark trade completed"}</button></div>
  </form>;
}

function PriceForm({ busy, post }: { busy: boolean; post: (url: string, body: Record<string, unknown>) => Promise<void> }) {
  return <form className="form-row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); post("/api/portfolio/prices", { growthPrice: Number(f.get("growthPrice")), reservePrice: Number(f.get("reservePrice")) }); }}>
    <div className="field"><label>3QQQ price (£)</label><input name="growthPrice" type="number" step="0.0001" required /></div>
    <div className="field"><label>CSH2 price (£)</label><input name="reservePrice" type="number" step="0.0001" required /></div>
    <div className="inline-actions"><button className="primary" disabled={busy}>Use these prices</button></div>
  </form>;
}

function ReconcileForm({ busy, post }: { busy: boolean; post: (url: string, body: Record<string, unknown>) => Promise<void> }) {
  return <form className="form-row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); post("/api/portfolio/reconcile", clean(Object.fromEntries(f))); }}>
    <div className="field"><label>3QQQ value (£)</label><input name="growthValue" type="number" min="0" step="0.01" /></div>
    <div className="field"><label>CSH2 value (£)</label><input name="reserveValue" type="number" min="0" step="0.01" /></div>
    <div className="field"><label>Or total portfolio (£)</label><input name="totalValue" type="number" min="0" step="0.01" /></div>
    <div className="inline-actions"><button className="secondary" disabled={busy}>Reconcile</button></div>
  </form>;
}

function DiscordForm({ busy, post }: { busy: boolean; post: (url: string, body: Record<string, unknown>) => Promise<void> }) {
  return <form className="form-row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); post("/api/settings/discord", { webhook: String(f.get("webhook")) }); }}>
    <div className="field" style={{ gridColumn: "1 / -1" }}><label>Discord webhook URL</label><input name="webhook" type="url" placeholder="https://discord.com/api/webhooks/..." required /></div>
    <div className="inline-actions"><button className="secondary" disabled={busy}>Save webhook</button></div>
  </form>;
}

function BillingButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function openPortal() {
    setBusy(true); setError("");
    const response = await fetch("/api/billing/portal", { method: "POST" });
    const body = await response.json();
    setBusy(false);
    if (!response.ok || !body.url) return setError(body.error ?? "Billing portal unavailable");
    location.href = body.url;
  }
  return <div className="inline-actions"><button className="secondary" type="button" onClick={openPortal} disabled={busy}>Manage subscription</button>{error && <span className="error">{error}</span>}</div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="stat"><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>; }
function friendly(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, (m) => m.toUpperCase()); }
function clean(obj: Record<string, FormDataEntryValue>) { return Object.fromEntries(Object.entries(obj).filter(([,v]) => v !== "").map(([k,v]) => [k, Number(v)])); }
