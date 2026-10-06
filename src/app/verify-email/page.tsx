import Link from "next/link";
import { VerifyForm } from "@/components/AuthForms";
export default async function VerifyPage({searchParams}:{searchParams:Promise<{token?:string}>}){const p=await searchParams;return <main className="auth-page"><section className="glass auth-card"><Link href="/" className="brand"><span className="brand-mark"/>StrategyOS</Link><h1>Verify email</h1><p>Confirm that this email address belongs to you.</p><VerifyForm token={p.token??""}/></section></main>;}
