import Link from "next/link";
import { LayoutDashboard, Layers3, Bell, Settings, Shield, Plus, UsersRound } from "lucide-react";

export function AppShell({ children, isAdmin=false }: { children:React.ReactNode; isAdmin?:boolean }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/app" className="brand"><span className="brand-mark"/><span>StrategyOS</span></Link>
      <div className="nav-group">
        <div className="nav-label">Workspace</div>
        <Link className="nav-link" href="/app"><LayoutDashboard size={17}/>Overview</Link>
        <Link className="nav-link" href="/app/strategies"><Layers3 size={17}/>My Strategies</Link>
        <Link className="nav-link" href="/app/strategies/new"><Plus size={17}/>Add Strategy</Link>
        <Link className="nav-link" href="/app/community"><UsersRound size={17}/>Community</Link>
        <Link className="nav-link" href="/app/notifications"><Bell size={17}/>Notifications</Link>
        <Link className="nav-link" href="/app/settings"><Settings size={17}/>Settings</Link>
        {isAdmin && <Link className="nav-link" href="/admin"><Shield size={17}/>Admin</Link>}
      </div>
    </aside>
    <main className="app-main">
      <div className="app-topbar"><div className="pill good">Rule engine online</div><Link href="/demo" className="button">Demo</Link></div>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}
