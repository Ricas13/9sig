"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router=useRouter(); const [error,setError]=useState("");
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); const form=new FormData(e.currentTarget);
    const response=await fetch("/api/register",{method:"POST",body:JSON.stringify(Object.fromEntries(form)),headers:{"content-type":"application/json"}});
    const body=await response.json();
    if(!response.ok) return setError(body.error ?? "Could not create account");
    router.push("/login");
  }
  return <main className="auth-shell"><section className="card auth-card">
    <div className="brand">9Sig Journey</div><h1>Create account</h1><p className="muted">Set up your private 3QQQ dashboard.</p>
    <form onSubmit={submit} className="stack">
      <div className="field"><label>Email</label><input name="email" type="email" required /></div>
      <div className="field"><label>Password</label><input name="password" type="password" minLength={8} required /></div>
      {error&&<div className="error">{error}</div>}<button className="primary" type="submit">Create account</button>
    </form>
    <p className="muted">Already registered? <Link href="/login">Log in</Link></p>
  </section></main>;
}