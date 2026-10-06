import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
export const dynamic="force-dynamic";
export default async function WorkspaceLayout({children}:{children:React.ReactNode}){const user=await requireUser();return <AppShell isAdmin={user.role==="ADMIN"}>{children}</AppShell>;}
