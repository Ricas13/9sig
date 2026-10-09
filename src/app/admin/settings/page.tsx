import { listSettings } from "@/lib/settings";
import { SETTING_GROUPS } from "@/domain/settings-registry";
import { SettingsEditor } from "@/components/SettingsEditor";
import { EncryptionPanel } from "@/components/EncryptionPanel";
import { keyStatus } from "@/lib/key-rotation";

export const dynamic = "force-dynamic";

// These cannot live in the database they unlock, so they are the only things left to the server's
// environment. The page shows whether each is present (never its value).
const BOOTSTRAP: Array<{ key: string; why: string }> = [
  { key: "DATABASE_URL", why: "Where the database is." },
  { key: "AUTH_SECRET", why: "Signs session cookies." },
  { key: "APP_ENCRYPTION_KEY", why: "Encrypts every value saved on this page." },
  { key: "AUTH_TRUST_HOST", why: "Lets sign-in work behind your proxy (set to true)." },
  { key: "APP_ENCRYPTION_KEY_PREVIOUS", why: "Only while rotating the encryption key (optional)." }
];

export default async function AdminSettingsPage() {
  const settings = await listSettings();
  const encryption = await keyStatus();
  return <>
    <div className="page-title"><div><div className="eyebrow">Admin</div><h1>Settings</h1>
      <p>Everything an operator configures lives here. Values are encrypted in the database and take effect within seconds. A value saved here overrides the same setting in the environment file; removing it falls back to the file.</p></div></div>
    <SettingsEditor initial={settings} groups={SETTING_GROUPS}/>
    <EncryptionPanel initial={encryption}/>
    <section className="card" style={{ marginTop: 18 }}>
      <h3>Still in the server environment</h3>
      <p className="help">Four things have to exist before the database can be reached, so they cannot be edited here.</p>
      {BOOTSTRAP.map((b) => <div className="why-row" key={b.key}><span>{b.key}<br/><small>{b.why}</small></span><b>{process.env[b.key] ? "Present" : "Missing"}</b></div>)}
    </section>
  </>;
}
