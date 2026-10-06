"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RecalculateButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="button" disabled={busy} onClick={async () => {
    setBusy(true);
    await fetch("/api/strategies/" + id + "/calculate", { method: "POST" });
    setBusy(false);
    router.refresh();
  }}>Recalculate</button>;
}

export function ExecuteAction({ action }: { action: { id: string; actionType: string } }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const needsPrice = ["BUY", "SELL"].includes(action.actionType);
  return <form className="inline" onSubmit={async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const response = await fetch("/api/actions/" + action.id + "/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ price: f.get("price") || undefined, quantity: f.get("quantity") || undefined })
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Could not complete action.");
    router.refresh();
  }}>
    {needsPrice && <>
      <input name="price" type="number" min="0" step="0.000001" placeholder="Execution price" required />
      <input name="quantity" type="number" min="0" step="0.00000001" placeholder="Quantity (optional)" />
    </>}
    <button className="button primary" disabled={busy}>{needsPrice ? "Mark trade completed" : "Mark reviewed"}</button>
    {error && <span className="error">{error}</span>}
  </form>;
}

export function ContributionForm({ id }: { id: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return <form className="form-grid" onSubmit={async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = String(f.get("when") || "");
    const occurredAt = value ? new Date(value).toISOString() : undefined;
    const r = await fetch("/api/strategies/" + id + "/contributions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: String(f.get("amount")), occurredAt })
    });
    setMessage(r.ok ? "Contribution recorded as cash." : "Could not record contribution.");
    if (r.ok) {
      e.currentTarget.reset();
      router.refresh();
    }
  }}>
    <div className="field"><label>Contribution</label><input name="amount" type="number" min="0.01" step="0.01" required /></div>
    <div className="field"><label>Date & time</label><input name="when" type="datetime-local" /></div>
    <div className="field full"><button className="button">Record contribution</button>{message && <div className={message.startsWith("Contribution recorded") ? "success" : "error"}>{message}</div>}</div>
  </form>;
}

export function ReconcileForm({ id, expected }: { id: string; expected?: number | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return <form className="form-grid" onSubmit={async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/strategies/" + id + "/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedValue: String(f.get("expected")),
        brokerValue: String(f.get("broker")),
        reason: f.get("reason") || undefined,
        affectsCash: Boolean(f.get("affectsCash"))
      })
    });
    const b = await r.json();
    setMessage(r.ok
      ? (b.resolved ? "Reconciliation resolved." : "Reconciliation recorded, but the strategy remains blocked until the discrepancy is resolved.")
      : b.error);
    if (r.ok) router.refresh();
  }}>
    <div className="field"><label>Expected value</label><input name="expected" type="number" min="0" step="0.01" defaultValue={expected ?? undefined} required /></div>
    <div className="field"><label>Broker reported value</label><input name="broker" type="number" min="0" step="0.01" required /></div>
    <div className="field full"><label>Reason</label><select name="reason"><option value="">Unknown adjustment</option><option>Broker fee</option><option>FX cost</option><option>Tax</option><option>Financing cost</option><option>Interest</option><option>Other</option></select></div>
    <div className="field full">
      <label><input name="affectsCash" type="checkbox" /> This difference definitely changes available cash</label>
      <div className="help">Use this for a fee, tax, financing or FX cash charge. Leave it off for an unexplained valuation difference; actions stay blocked instead of treating unknown drift as spendable cash.</div>
    </div>
    <div className="field full"><button className="button">Reconcile</button>{message && <div className={message.includes("resolved") ? "success" : "error"}>{message}</div>}</div>
  </form>;
}
