import { auth } from "@/auth";
import { NextResponse } from "next/server";

const publicPrefixes = ["/", "/demo", "/login", "/register", "/verify-email", "/reset-password", "/api/auth", "/api/register", "/api/verify-email", "/api/password-reset", "/api/stripe/webhook", "/api/cron", "/api/health"];

export const proxy = auth((request) => {
  const path = request.nextUrl.pathname;
  const isPublic = publicPrefixes.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
  if (!request.auth && !isPublic) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
