import { requirePageUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
export const dynamic="force-dynamic";
export default async function WorkspaceLayout({children}:{children:React.ReactNode}){const user=await requirePageUser();return <AppShell isAdmin={user.role==="ADMIN"}>{children}</AppShell>;}
