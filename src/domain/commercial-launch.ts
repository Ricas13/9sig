/** Pure production launch checks, intentionally separate from application liveness. */
type Environment=Record<string,string|undefined>;
export type LaunchCheck={key:string;passed:boolean;reason:string};
const validHttps=(s:string|undefined)=>{try{return !!s&&new URL(s).protocol==="https:";}catch{return false;}};
const enough=(s:string|undefined,length:number)=>!!s&&s.length>=length&&!/^(replace|changeme|example|ci-only|test-)/i.test(s);
const validKey=(s:string|undefined)=>{if(!s||!/^[A-Za-z0-9+/]{43}=$/.test(s))return false;
  return Buffer.from(s,"base64").length===32;};
export function checkCommercialLaunch(env:Environment):LaunchCheck[]{
 const stripe=env.STRIPE_SECRET_KEY, webhook=env.STRIPE_WEBHOOK_SECRET;
 return [
 {key:"application_url",passed:validHttps(env.NEXT_PUBLIC_APP_URL),reason:"Public origin must use HTTPS."},
 {key:"database",passed:!!env.DATABASE_URL&&/^postgres(ql)?:\/\//.test(env.DATABASE_URL)&&(/@(db|postgres|postgresql):5432\//.test(env.DATABASE_URL)||!/(localhost|127\.0\.0\.1)/.test(env.DATABASE_URL)),reason:"Configure a persistent protected PostgreSQL service (Docker network or external host)."},
 {key:"auth_secret",passed:enough(env.AUTH_SECRET,32),reason:"Supply a unique secure authentication secret."},
 {key:"encryption",passed:validKey(env.APP_ENCRYPTION_KEY),reason:"Supply a properly generated 32-byte encryption key."},
 {key:"worker_auth",passed:enough(env.CRON_SECRET,32),reason:"Supply a unique worker bearer token."},
 {key:"stripe_live",passed:!!stripe&&stripe.startsWith("sk_live_")&&stripe.length>=20,reason:"Stripe LIVE secret key is required for paid launch."},
 {key:"stripe_webhook",passed:!!webhook&&webhook.startsWith("whsec_")&&webhook.length>=20,reason:"Stripe webhook signing secret is required."},
 {key:"email",passed:env.EMAIL_PROVIDER==="http"&&validHttps(env.EMAIL_HTTP_ENDPOINT)&&enough(env.EMAIL_HTTP_TOKEN,12)&&!!env.EMAIL_FROM&&!env.EMAIL_FROM.endsWith("@example.com"),reason:"Configure live transactional email with HTTPS credentials."},
 {key:"market_data_mode",passed:env.MARKET_DATA_PROVIDER==="http"&&validHttps(env.MARKET_DATA_HTTP_BASE_URL)&&enough(env.MARKET_DATA_HTTP_TOKEN,12),reason:"Configure an authenticated historical/intraday and current-price service that permits your commercial use."},
 {key:"backup_operator_attestation",passed:env.BACKUPS_RESTORE_VERIFIED==="true",reason:"Operator must verify a successful backup restore."},
 {key:"regulatory_signoff",passed:env.UK_REGULATORY_SIGNOFF_VERIFIED==="true",reason:"Obtain documented UK legal/regulatory review before charging customers."},
 {key:"instrument_review",passed:env.REGIONAL_INSTRUMENTS_VERIFIED==="true",reason:"Operator must approve eligible regional trading lines."}
 ];
}
