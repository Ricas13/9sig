export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/((?!api/auth|api/register|api/stripe/webhook|api/cron|_next/static|_next/image|favicon.ico|login|register).*)"],
};
