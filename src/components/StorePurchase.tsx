"use client";
import { useEffect, useState } from "react";

// In-app purchase inside the Android/iOS shell, through RevenueCat's Capacitor plugin. The plugin is
// native code: on a normal web page it does not exist and a hint is shown instead. A purchase does
// not unlock anything by itself; the store's notification reaches the server, which changes the plan,
// and this component simply waits for that to show up.
type Product = { productId: string; planSlug: string; planName: string; cadence: "MONTHLY" | "ANNUAL" };
type Pkg = { identifier: string; product: { identifier: string; title: string; priceString: string } };
type PurchasesPlugin = {
  configure(o: { apiKey: string; appUserID: string }): Promise<void>;
  getOfferings(): Promise<{ current?: { availablePackages: Pkg[] } | null }>;
  purchasePackage(o: { aPackage: Pkg }): Promise<unknown>;
  restorePurchases(): Promise<unknown>;
};

function plugin(): { purchases: PurchasesPlugin | null } {
  const cap = (typeof window !== "undefined" ? (window as unknown as { Capacitor?: { Plugins?: { Purchases?: PurchasesPlugin } } }).Capacitor : undefined);
  return { purchases: cap?.Plugins?.Purchases ?? null };
}

async function waitForPlan(previous: string, attempts = 30): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const r = await fetch("/api/billing/status", { cache: "no-store" });
      if (r.ok) {
        const s = await r.json() as { billedBy: string; plan: { slug: string } | null; status: string };
        if (s.billedBy !== "STRIPE" && s.status !== "FREE" && s.plan?.slug !== previous) return true;
        if (s.billedBy !== "STRIPE" && s.status !== "FREE" && previous === "free") return true;
      }
    } catch { /* keep waiting */ }
  }
  return false;
}

export function StorePurchase({ apiKey, userId, products, currentPlanSlug, manageUrl }: { apiKey: string; userId: string; products: Product[]; currentPlanSlug: string; manageUrl: string }) {
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const names = new Map(products.map((p) => [p.productId, p]));

  useEffect(() => {
    (async () => {
      const { purchases } = plugin();
      if (!purchases) { setAvailable(false); return; }
      try {
        await purchases.configure({ apiKey, appUserID: userId });
        const offerings = await purchases.getOfferings();
        setPackages((offerings.current?.availablePackages ?? []).filter((p) => names.has(p.product.identifier)));
      } catch { setMessage("Could not load the store. Check your connection and try again."); setPackages([]); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, userId]);

  if (!available) return <p className="help">Open this page inside the app to subscribe.</p>;

  async function buy(pkg: Pkg) {
    const { purchases } = plugin();
    if (!purchases) return;
    setBusy(true); setMessage("");
    try {
      await purchases.purchasePackage({ aPackage: pkg });
      setMessage("Thank you. Confirming your purchase…");
      setMessage((await waitForPlan(currentPlanSlug)) ? "Your plan is active." : "Your purchase went through. Your plan will update within a few minutes.");
    } catch (error) {
      const cancelled = (error as { userCancelled?: boolean })?.userCancelled;
      setMessage(cancelled ? "" : "The purchase did not complete. You have not been charged.");
    } finally { setBusy(false); }
  }
  async function restore() {
    const { purchases } = plugin();
    if (!purchases) return;
    setBusy(true); setMessage("");
    try { await purchases.restorePurchases(); setMessage((await waitForPlan("restore", 10)) ? "Purchases restored." : "No active purchases were found to restore."); }
    catch { setMessage("Could not restore purchases. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="stack">
    {packages === null && <p className="help">Loading plans…</p>}
    {packages?.length === 0 && !message && <p className="help">No plans are available in the store right now.</p>}
    {packages?.map((pkg) => {
      const info = names.get(pkg.product.identifier)!;
      return <div className="why-row" key={pkg.identifier}>
        <span>{info.planName} · {info.cadence === "ANNUAL" ? "yearly" : "monthly"}<br /><small>{pkg.product.priceString}</small></span>
        <button className="button primary" disabled={busy} onClick={() => buy(pkg)}>Subscribe</button>
      </div>;
    })}
    <div className="inline">
      <button className="button" disabled={busy} onClick={restore}>Restore purchases</button>
      <a className="button" href={manageUrl} target="_blank" rel="noreferrer">Manage subscription</a>
    </div>
    {message && <div className={message.startsWith("Your plan") || message.startsWith("Purchases restored") ? "success" : "help"} role="status">{message}</div>}
  </div>;
}
