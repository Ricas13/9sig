import Link from "next/link";
import { redirect } from "next/navigation";
import { adminExists } from "@/lib/setup";
import { SetupForm } from "@/components/SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await adminExists()) redirect("/login");
  return <main className="auth-page"><section className="glass auth-card">
    <Link href="/" className="brand"><span className="brand-mark"/>{process.env.NEXT_PUBLIC_BRAND_NAME?.trim()||"Rebalune"}</Link>
    <h1>Set up your administrator.</h1>
    <p>This is a new installation. Create the first administrator account. Everything else is configured afterwards from the admin screen.</p>
    <SetupForm/>
  </section></main>;
}
