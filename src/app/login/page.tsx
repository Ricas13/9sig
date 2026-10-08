import Link from "next/link";
import { LoginForm } from "@/components/AuthForms";
import { safeNextPath } from "@/domain/safe-next";
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){const params=await searchParams;return <main className="auth-page"><section className="glass auth-card"><Link href="/" className="brand"><span className="brand-mark"/>{process.env.NEXT_PUBLIC_BRAND_NAME?.trim()||"Rebalune"}</Link><h1>Welcome back.</h1><p>Open your strategy workspace and see what needs attention.</p><LoginForm next={safeNextPath(params.next)}/><div className="inline" style={{marginTop:18}}><Link href="/reset-password">Forgot password?</Link><span className="help">·</span><Link href="/register">Create account</Link></div></section></main>;}
