import { auth } from "@/auth";
import { ensurePortfolio, getUser } from "@/lib/portfolio";

export async function requireUser() {
  const session=await auth();
  const email=session?.user?.email;
  if(!email) throw new Error("UNAUTHENTICATED");
  const user=await getUser(email);
  if(!user) throw new Error("UNAUTHENTICATED");
  const portfolio=await ensurePortfolio(user.id);
  return {session,user,portfolio};
}