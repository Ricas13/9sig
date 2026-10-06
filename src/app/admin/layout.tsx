import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";

export const dynamic="force-dynamic";

export default async function AdminLayout({children}:{children:React.ReactNode}){
  try{
    await requireAdmin();
  }catch(error){
    if(error instanceof Error&&error.message==="FORBIDDEN")redirect("/app");
    redirect("/login?session=expired");
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/admin" className="brand"><span className="brand-mark"/>StrategyOS Admin</Link>
      <div className="nav-group">
        <div className="nav-label">Control plane</div>
        <Link className="nav-link" href="/admin">System</Link>
        <Link className="nav-link" href="/admin/plans">Plans</Link>
        <Link className="nav-link" href="/admin/strategies">Strategies</Link>
        <Link className="nav-link" href="/admin/instruments">Instruments</Link>
        <Link className="nav-link" href="/admin/users">Users</Link>
        <Link className="nav-link" href="/app">Customer app</Link>
      </div>
    </aside>
    <main className="app-main"><div className="app-content">{children}</div></main>
  </div>;
}
