import Link from "next/link";
import { LoginForm,OAuthButtons } from "@/components/AuthForms";
import { enabledOAuthProviders } from "@/domain/oauth-providers";
import { safeNextPath } from "@/domain/safe-next";
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string;error?:string}>}){const params=await searchParams;return <main className="auth-page"><section className="glass auth-card"><Link href="/" className="brand"><span className="brand-mark"/>{process.env.NEXT_PUBLIC_BRAND_NAME?.trim()||"Rebalune"}</Link><h1>Welcome back.</h1><p>Open your strategy workspace and see what needs attention.</p><OAuthButtons providers={enabledOAuthProviders(process.env)} next={safeNextPath(params.next)} error={params.error}/><LoginForm next={safeNextPath(params.next)}/><div className="inline" style={{marginTop:18}}><Link href="/reset-password">Forgot password?</Link><span className="help">·</span><Link href="/register">Create account</Link></div></section></main>;}
