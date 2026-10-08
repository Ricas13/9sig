import { sql } from "@/lib/db";
import { RetryDeliveries } from "@/components/RetryDeliveries";
import { IntegrationTests } from "@/components/IntegrationTests";
import { checkCommercialLaunch } from "@/domain/commercial-launch";
export const dynamic="force-dynamic";
const explanations:Record<string,string>={
 stripe_live:"Configure the Stripe secret in your Oracle Docker secret store; never paste it into ordinary settings.",
 stripe_webhook:"Register /api/stripe/webhook with Stripe and supply the signing secret. Webhook events below show actual processing results.",
 email:"Set EMAIL_PROVIDER=http, EMAIL_HTTP_ENDPOINT, EMAIL_HTTP_TOKEN and EMAIL_FROM as protected secrets; use a supported transactional provider adapter.",
 market_data_mode:"Connect a quote provider offering live prices, historical intraday observations, currencies and adjusted data.",
 worker_auth:"Set CRON_SECRET and run the private scheduler. Review last execution and failures below.",
 backup_operator_attestation:"Configure encrypted offsite backups and demonstrate a restore before attesting success."
};
export default async function OperationsPage(){
 const checks=checkCommercialLaunch(process.env);
 const [jobs,delivery,webhooks]=await Promise.all([
  sql.unsafe("SELECT DISTINCT ON (worker_key) worker_key,status,started_at,finished_at FROM worker_runs ORDER BY worker_key,started_at DESC LIMIT 50"),
  sql.unsafe("SELECT channel,status,count(*)::int AS n FROM notification_deliveries GROUP BY channel,status ORDER BY channel,status"),
  sql.unsafe("SELECT status,count(*)::int AS n FROM billing_webhook_events GROUP BY status ORDER BY status")
 ]);
 const sections=[
  {title:"Payments · Stripe",keys:["stripe_live","stripe_webhook"]},
  {title:"Email delivery",keys:["email"]},
  {title:"Automated pricing",keys:["market_data_mode"]},
  {title:"Scheduled jobs",keys:["worker_auth"]},
  {title:"Backups and recovery",keys:["backup_operator_attestation"]}
 ];
 return <><div className="page-title"><div><div className="eyebrow">Admin · Operations</div><h1>Integrations and jobs</h1><p>Configuration status and recorded operational outcomes. Credentials are never exposed; a configured credential is not proof of a successful connection.</p></div></div>
 <div className="detail-grid">{sections.map(section=><section className="card" key={section.title}><h3>{section.title}</h3>{section.keys.map(key=>{const c=checks.find(v=>v.key===key);return <div key={key}><p><strong>{c?.passed?"Configured":"Needs setup"}</strong></p><p className="help">{explanations[key]}</p></div>;})}</section>)}</div>
 <div className="detail-grid" style={{marginTop:18}}>
 <section className="card"><h3>Stripe webhook processing</h3>{webhooks.length?webhooks.map((w:any)=><div className="why-row" key={w.status}><span>{w.status}</span><strong>{w.n}</strong></div>):<p className="help">No webhook events recorded.</p>}<p><a href="/admin/plans">Manage plans and prices</a></p></section>
 <section className="card"><h3>Notification deliveries</h3>{delivery.length?delivery.map((d:any)=><div className="why-row" key={d.channel+":"+d.status}><span>{d.channel} · {d.status}</span><strong>{d.n}</strong></div>):<p className="help">No delivery attempts recorded.</p>}</section>
 </div>
 <div style={{marginTop:18}}><IntegrationTests/></div>
 <div style={{marginTop:18}}><RetryDeliveries/></div>
 <section className="card" style={{marginTop:18}}><h3>Latest worker executions</h3>{jobs.length?jobs.map((job:any)=><div className="why-row" key={job.worker_key}><span>{job.worker_key}<small> · {new Date(job.started_at).toLocaleString("en-GB")}</small></span><strong>{job.status}</strong></div>):<p className="help">No runs recorded. Verify the scheduler service is running.</p>}</section>
 <section className="card" style={{marginTop:18}}><h3>Security boundary</h3><p className="help">The dashboard is intentionally read-only for live secrets. Connection tests and secret updates require a dedicated encrypted secret-management adapter, audit records, CSRF protection and server-side provider validation. Do not turn an arbitrary URL or token field into unrestricted server-side network access.</p></section></>;
}
