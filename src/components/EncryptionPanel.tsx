"use client";
import { useState } from "react";

type Status = { previousKeyPresent: boolean; groups: Array<{ label: string; total: number; onOldKey: number; unreadable: number }>; onOldKey: number; unreadable: number };

function newKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function EncryptionPanel({ initial }: { initial: Status }) {
  const [status, setStatus] = useState<Status | null>(initial);
  const [generated, setGenerated] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function reencrypt() {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/admin/encryption", { method: "POST" });
      const b = await r.json().catch(() => ({} as { error?: string; reencrypted?: number; status?: Status }));
      if (!r.ok) { setMessage(b.error ?? "Could not re-encrypt."); return; }
      setStatus(b.status ?? null);
      setMessage(`Done. ${b.reencrypted ?? 0} value(s) now use the current key. You can remove APP_ENCRYPTION_KEY_PREVIOUS and restart.`);
    } catch { setMessage("Could not reach the server."); }
    finally { setBusy(false); }
  }

  return <section className="card" style={{ marginTop: 18 }}>
    <h3>Encryption key</h3>
    <p className="help">Saved settings, Discord webhooks and two-step secrets are encrypted with <code>APP_ENCRYPTION_KEY</code>. To change it without losing any of them: (1) generate a new key below; (2) in the server environment set <code>APP_ENCRYPTION_KEY</code> to the new key and <code>APP_ENCRYPTION_KEY_PREVIOUS</code> to the old one, then restart; (3) press Re-encrypt; (4) remove <code>APP_ENCRYPTION_KEY_PREVIOUS</code> and restart. Keep a copy of the key somewhere safe: without it saved values cannot be recovered.</p>
    {status === null ? <p className="help">Checking…</p> : <>
      {status.groups.map((g) => <div className="why-row" key={g.label}><span>{g.label}<br /><small>{g.total} stored</small></span><b>{g.unreadable ? `${g.unreadable} unreadable` : g.onOldKey ? `${g.onOldKey} on old key` : "current key"}</b></div>)}
      {status.unreadable > 0 && <div className="error" role="alert">{status.unreadable} value(s) cannot be read with the configured keys. If you changed the key, put the old one in APP_ENCRYPTION_KEY_PREVIOUS.</div>}
      {status.previousKeyPresent && <div className="inline"><button className="button primary" disabled={busy || status.onOldKey === 0} onClick={reencrypt}>{status.onOldKey ? `Re-encrypt ${status.onOldKey} value${status.onOldKey === 1 ? "" : "s"}` : "Everything is on the current key"}</button></div>}
    </>}
    <div className="inline" style={{ marginTop: 12 }}>
      <button className="button" type="button" onClick={() => setGenerated(newKey())}>Generate a new key</button>
      {generated && <input readOnly aria-label="New encryption key" value={generated} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 280 }} />}
    </div>
    {message && <div className={message.startsWith("Done") ? "success" : "error"} role="status">{message}</div>}
  </section>;
}
