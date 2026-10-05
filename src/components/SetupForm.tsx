"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SetupForm({ today }: { today: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    const raw = Object.fromEntries(f);
    const body: Record<string, unknown> = {
      startDate: raw.startDate,
      startingCapital: Number(raw.startingCapital),
      monthlyContribution: Number(raw.monthlyContribution),
      growthValue: Number(raw.growthValue),
      reserveValue: Number(raw.reserveValue),
    };
    if (raw.growthPrice) body.growthPrice = Number(raw.growthPrice);
    if (raw.reservePrice) body.reservePrice = Number(raw.reservePrice);
    const response = await fetch("/api/portfolio/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json(); setBusy(false);
    if (!response.ok) return setError(json.error ?? "Could not save setup");
    router.refresh();
  }
  return <section className="card action-card">
    <div className="action-kicker">Start your journey</div><h1 className="action-title">Set up 9Sig</h1>
    <p className="action-copy">Four numbers, then the page takes over. The defaults are £1,000 starting capital, £500/month, 60% 3QQQ and 40% CSH2.</p>
    <form onSubmit={submit} className="form-row">
      <div className="field"><label>Start date</label><input name="startDate" type="date" defaultValue={today} required /></div>
      <div className="field"><label>Starting capital (£)</label><input name="startingCapital" type="number" step="0.01" defaultValue="1000" required /></div>
      <div className="field"><label>3QQQ value (£)</label><input name="growthValue" type="number" step="0.01" defaultValue="600" required /></div>
      <div className="field"><label>CSH2 value (£)</label><input name="reserveValue" type="number" step="0.01" defaultValue="400" required /></div>
      <div className="field"><label>Monthly contribution (£)</label><input name="monthlyContribution" type="number" step="0.01" defaultValue="500" required /></div>
      <div />
      <details style={{ gridColumn: "1 / -1" }}><summary>Automatic price unavailable?</summary><div className="form-row"><div className="field"><label>3QQQ price (£)</label><input name="growthPrice" type="number" step="0.0001" /></div><div className="field"><label>CSH2 price (£)</label><input name="reservePrice" type="number" step="0.0001" /></div></div></details>
      {error && <div className="error" style={{ gridColumn: "1 / -1" }}>{error}</div>}
      <div className="inline-actions"><button className="primary" disabled={busy}>Start 9Sig</button></div>
    </form>
  </section>;
}