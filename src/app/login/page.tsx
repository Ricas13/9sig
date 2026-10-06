import Link from "next/link";
import { LoginForm } from "@/components/AuthForms";
export default function LoginPage(){return <main className="auth-page"><section className="glass auth-card"><Link href="/" className="brand"><span className="brand-mark"/>StrategyOS</Link><h1>Welcome back.</h1><p>Open your strategy workspace and see what needs attention.</p><LoginForm/><div className="inline" style={{marginTop:18}}><Link href="/reset-password">Forgot password?</Link><span className="help">·</span><Link href="/register">Create account</Link></div></section></main>;}
