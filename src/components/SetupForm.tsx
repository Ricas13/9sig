"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <form className="stack" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: f.get("code"), email: f.get("email"), password: f.get("password") }) });
      const b = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) { setError(b.error ?? "Setup failed. Please try again."); return; }
      await signIn("credentials", { email: String(f.get("email")), password: String(f.get("password")), redirect: false });
      router.push("/admin/settings");
    } catch { setError("Could not reach the server. Please try again."); }
    finally { setBusy(false); }
  }}>
    <div className="field"><label htmlFor="setup-code">Setup code</label><input id="setup-code" name="code" autoComplete="off" required/><div className="help">Printed in the server log when it started: look for the line starting “[setup]”.</div></div>
    <div className="field"><label htmlFor="setup-email">Administrator email</label><input id="setup-email" name="email" type="email" autoComplete="email" required/></div>
    <div className="field"><label htmlFor="setup-password">Password</label><input id="setup-password" name="password" type="password" autoComplete="new-password" minLength={12} required/><div className="help">At least 12 characters.</div></div>
    {error && <div className="error" role="alert">{error}</div>}
    <button className="button primary" disabled={busy}>Create administrator</button>
  </form>;
}
