import Link from "next/link";
import { RegisterForm,OAuthButtons } from "@/components/AuthForms";
import { enabledOAuthProviders } from "@/domain/oauth-providers";
export const dynamic="force-dynamic";
export default function RegisterPage(){return <main className="auth-page"><section className="glass auth-card"><Link href="/" className="brand"><span className="brand-mark"/>{process.env.NEXT_PUBLIC_BRAND_NAME?.trim()||"Rebalune"}</Link><h1>Start simple.</h1><p>Country and base currency are enough to create the account. Strategy-specific details come later, only when needed.</p><OAuthButtons providers={enabledOAuthProviders(process.env)}/><RegisterForm/><p className="help">By continuing you acknowledge that this product calculates rules for strategies you select yourself; it does not assess suitability.</p></section></main>;}
