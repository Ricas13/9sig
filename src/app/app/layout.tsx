import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export const dynamic="force-dynamic";

export default async function WorkspaceLayout({children}:{children:React.ReactNode}){
  let user;
  try{
    user=await requireUser();
  }catch{
    redirect("/login?session=expired");
  }
  return <AppShell isAdmin={user.role==="ADMIN"}>{children}</AppShell>;
}
