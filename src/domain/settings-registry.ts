// Every operator setting that can be managed from the admin screen instead of an environment file.
// Keys are the environment variable names the code already reads, so a value saved in the database
// simply takes the place of the variable. Anything not listed here stays an environment variable on
// purpose: the database connection, the session secret and the key that encrypts these very values
// cannot be stored in the place they unlock.
export type SettingKind = "text" | "secret" | "boolean" | "number" | "select" | "url" | "multiline-secret";

export type SettingDefinition = {
  key: string;
  label: string;
  group: string;
  kind: SettingKind;
  help: string;
  options?: readonly string[];
  min?: number;
  max?: number;
  integer?: boolean;
  /** Extra format check for text settings, with the message to show when it fails. */
  pattern?: RegExp;
  patternMessage?: string;
  /** Takes effect without a restart? Everything does except where noted. */
  note?: string;
};

export const SETTING_GROUPS = [
  "General", "Billing (Stripe)", "Email", "Market data", "Sign-in providers", "Mobile apps", "Security", "Launch sign-offs", "Background worker"
] as const;

const bool = (key: string, label: string, group: string, help: string): SettingDefinition => ({ key, label, group, kind: "boolean", help });

export const SETTINGS: readonly SettingDefinition[] = [
  { key: "NEXT_PUBLIC_APP_URL", label: "Public web address", group: "General", kind: "url", help: "The full https address customers use, for example https://app.example.com. Used for links in emails, sign-in redirects and request checks." },
  { key: "NEXT_PUBLIC_BRAND_NAME", label: "Product name", group: "General", kind: "text", help: "Shown across the site and in emails. Defaults to Rebalune." },
  bool("PUBLIC_INDEXING_ENABLED", "Let search engines index public pages", "General", "Leave off on staging. Turn on only for the real public site."),
  { key: "GOOGLE_SITE_VERIFICATION", label: "Google Search Console token", group: "General", kind: "text", help: "The verification token from Search Console (optional)." },
  { key: "TRUSTED_PROXY_HOPS", label: "Proxies in front of the app", group: "General", kind: "number", min: 0, max: 5, integer: true, help: "How many reverse proxies sit in front of the app (for example 1 for Caddy or nginx). Rate limits use the address the nearest trusted proxy saw." },

  bool("REBALUNE_PAID_LAUNCH_ENABLED", "Accept paid subscriptions", "Billing (Stripe)", "Off by default. With a live Stripe key, checkout also stays blocked until every launch check passes."),
  { key: "STRIPE_SECRET_KEY", label: "Stripe secret key", group: "Billing (Stripe)", kind: "secret", help: "sk_live_… or rk_live_… for real payments; sk_test_… for staging." },
  { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhook signing secret", group: "Billing (Stripe)", kind: "secret", help: "whsec_… from the Stripe webhook endpoint pointing at /api/stripe/webhook." },

  { key: "EMAIL_PROVIDER", label: "Email provider", group: "Email", kind: "select", options: ["http", "mock"], help: "http sends through your transactional email service. mock only works outside production and sends nothing." },
  { key: "EMAIL_HTTP_ENDPOINT", label: "Email service address", group: "Email", kind: "url", help: "The https endpoint that accepts a JSON message." },
  { key: "EMAIL_HTTP_TOKEN", label: "Email service token", group: "Email", kind: "secret", help: "Bearer token for the email service." },
  { key: "EMAIL_FROM", label: "From address", group: "Email", kind: "text", help: "For example support@yourdomain.com. Must be an address your email service may send from." },

  { key: "MARKET_DATA_MODE", label: "Market data mode", group: "Market data", kind: "select", options: ["PROVIDER", "MANUAL"], help: "PROVIDER fetches prices from your data service. MANUAL means prices are entered by people." },
  { key: "MARKET_DATA_PROVIDER", label: "Market data provider", group: "Market data", kind: "select", options: ["http", "mock"], help: "http uses the service below. mock only works outside production." },
  { key: "MARKET_DATA_HTTP_BASE_URL", label: "Market data service address", group: "Market data", kind: "url", help: "Base https address of a service licensed for your commercial use." },
  { key: "MARKET_DATA_HTTP_TOKEN", label: "Market data token", group: "Market data", kind: "secret", help: "Bearer token for the market data service." },
  { key: "MARKET_MAX_QUOTE_MOVE", label: "Largest believable price move", group: "Market data", kind: "number", min: 0.05, max: 5, help: "0.5 means a quote more than 50% away from the previous one is rejected as a likely data error." },

  { key: "AUTH_GOOGLE_ID", label: "Google client ID", group: "Sign-in providers", kind: "text", help: "From Google Cloud Console. Redirect URI: <public address>/api/auth/callback/google" },
  { key: "AUTH_GOOGLE_SECRET", label: "Google client secret", group: "Sign-in providers", kind: "secret", help: "Pairs with the client ID. Both are needed for the Google button to appear." },
  { key: "AUTH_APPLE_ID", label: "Apple Services ID", group: "Sign-in providers", kind: "text", help: "Redirect URI: <public address>/api/auth/callback/apple" },
  { key: "AUTH_APPLE_TEAM_ID", label: "Apple team ID", group: "Sign-in providers", kind: "text", help: "Used with the key below to generate Apple's client secret automatically." },
  { key: "AUTH_APPLE_KEY_ID", label: "Apple key ID", group: "Sign-in providers", kind: "text", help: "The key ID of the Sign in with Apple private key." },
  { key: "AUTH_APPLE_PRIVATE_KEY", label: "Apple private key", group: "Sign-in providers", kind: "multiline-secret", help: "Paste the full .p8 key including the BEGIN/END lines." },
  { key: "AUTH_APPLE_SECRET", label: "Apple client secret (advanced)", group: "Sign-in providers", kind: "secret", help: "Only if you generate Apple's JWT yourself; otherwise leave empty and fill the three fields above." },

  { key: "ANDROID_PACKAGE_NAME", label: "Android package name", group: "Mobile apps", kind: "text", pattern: /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/, patternMessage: "Use a reverse-domain name such as com.example.rebalune.", help: "The applicationId of the Android app. Together with the fingerprint below it lets Android open website links in the app." },
  { key: "ANDROID_SHA256_CERT_FINGERPRINTS", label: "Android signing certificate fingerprint(s)", group: "Mobile apps", kind: "text", pattern: /^([0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31})(\s*,\s*[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31})*$/, patternMessage: "SHA-256 fingerprints look like AB:CD:… (32 pairs). Separate several with commas.", help: "From Play Console › App integrity (use the Play App Signing key), plus your upload key while testing." },
  { key: "IOS_TEAM_ID", label: "Apple team ID", group: "Mobile apps", kind: "text", pattern: /^[A-Z0-9]{10}$/, patternMessage: "A team ID is 10 capital letters or digits.", help: "From your Apple Developer account membership page." },
  { key: "IOS_BUNDLE_ID", label: "iOS bundle ID", group: "Mobile apps", kind: "text", pattern: /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*)+$/, patternMessage: "Use a reverse-domain name such as com.example.rebalune.", help: "Must match the bundle ID of the iOS app. Lets iOS open website links in the app." },

  bool("ADMIN_MFA_REQUIRED", "Require two-step sign-in for admins", "Security", "Turn on once every admin has enabled two-step sign-in under Settings. Admins without it are kept out of admin tools."),
  { key: "CRON_SECRET", label: "Background job secret", group: "Security", kind: "secret", help: "Bearer token your scheduler sends to /api/cron/actions. At least 32 characters." },

  bool("BACKUPS_RESTORE_VERIFIED", "A backup restore has been tested", "Launch sign-offs", "Confirm only after running the restore drill and keeping its report."),
  bool("UK_REGULATORY_SIGNOFF_VERIFIED", "Legal and regulatory review done", "Launch sign-offs", "Confirm only with documented advice for where you operate."),
  bool("REGIONAL_INSTRUMENTS_VERIFIED", "Eligible regional instruments approved", "Launch sign-offs", "Confirm after reviewing the instruments admin page."),
  bool("LEGAL_PUBLIC_PAGES_VERIFIED", "Terms and privacy pages published and reviewed", "Launch sign-offs", "Confirm once the public legal pages are live and reviewed."),
  bool("BRAND_CLEARANCE_VERIFIED", "Name, trade mark and domain cleared", "Launch sign-offs", "Confirm after clearing the product name and domain."),

  { key: "CRON_TIME_BUDGET_MS", label: "Job time budget (ms)", group: "Background worker", kind: "number", min: 10000, max: 600000, integer: true, help: "How long one background run may take before it defers the rest. Default 150000." },
  { key: "CRON_CONCURRENCY", label: "Job concurrency", group: "Background worker", kind: "number", min: 1, max: 32, integer: true, help: "Strategies calculated in parallel. Default 4." },
  { key: "CRON_MAX_INSTANCES", label: "Strategies per run", group: "Background worker", kind: "number", min: 100, max: 100000, integer: true, help: "Upper bound per run; the stalest are done first. Default 5000." }
];

export const SETTING_KEYS = new Set(SETTINGS.map((s) => s.key));
export const settingByKey = (key: string) => SETTINGS.find((s) => s.key === key);
export const isSecretKind = (kind: SettingKind) => kind === "secret" || kind === "multiline-secret";

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

export function validateSetting(def: SettingDefinition, raw: unknown): ValidationResult {
  if (typeof raw !== "string") return { ok: false, error: "Value must be text." };
  const value = def.kind === "multiline-secret" ? raw.replace(/\r\n/g, "\n").trim() : raw.trim();
  if (!value) return { ok: false, error: "Value is empty. Use clear to remove a setting." };
  if (value.length > (def.kind === "multiline-secret" ? 4000 : 600)) return { ok: false, error: "Value is too long." };
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return { ok: false, error: "Value contains control characters." };
  switch (def.kind) {
    case "boolean":
      return value === "true" || value === "false" ? { ok: true, value } : { ok: false, error: "Choose on or off." };
    case "select":
      return def.options?.includes(value) ? { ok: true, value } : { ok: false, error: "Choose one of: " + def.options?.join(", ") + "." };
    case "number": {
      if (!/^-?\d+(\.\d+)?$/.test(value)) return { ok: false, error: "Enter a number." };
      const n = Number(value);
      if (def.integer && !Number.isInteger(n)) return { ok: false, error: "Enter a whole number." };
      if (def.min != null && n < def.min) return { ok: false, error: "Must be at least " + def.min + "." };
      if (def.max != null && n > def.max) return { ok: false, error: "Must be at most " + def.max + "." };
      return { ok: true, value };
    }
    case "url": {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return { ok: false, error: "Use an https:// address." };
        if (url.username || url.password) return { ok: false, error: "Do not put credentials in the address." };
        return { ok: true, value: value.replace(/\/+$/, "") };
      } catch {
        return { ok: false, error: "Enter a full address such as https://example.com." };
      }
    }
    case "multiline-secret":
      return { ok: true, value };
    default:
      if (/[\r\n]/.test(value)) return { ok: false, error: "Must be a single line." };
      if (def.pattern && !def.pattern.test(value)) return { ok: false, error: def.patternMessage ?? "Not in the expected format." };
      return { ok: true, value };
  }
}
