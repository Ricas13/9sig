import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Route gate for the signed-in areas only. This file must live in src/ (the app directory is
// src/app); a copy at the repository root is silently ignored by Next.js. Marketing and SEO pages,
// the auth pages and robots/sitemap are deliberately not matched, so they stay public. API routes
// are not matched either: every handler authenticates itself and answers 401/403 as JSON.
// Revoked sessions (for example after a password reset) are detected by requirePageUser, which
// needs the database and therefore cannot run here.
export const proxy = auth((request) => {
  if (!request.auth) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"]
};
