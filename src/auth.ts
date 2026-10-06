import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "@/lib/db";
import { clientIp, consumeRateLimit, hashToken } from "@/lib/security";

const credentials = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        try {
          await Promise.all([
            consumeRateLimit("login-email:" + hashToken(email), 12, 15 * 60),
            consumeRateLimit("login-ip:" + clientIp(request), 60, 15 * 60)
          ]);
        } catch {
          return null;
        }
        const rows = await sql.unsafe(
          "SELECT id,email,password_hash,email_verified_at,role,auth_version FROM users WHERE email=$1 AND deleted_at IS NULL LIMIT 1",
          [email]
        );
        const user = rows[0];
        if (!user) return null;
        if (process.env.NODE_ENV === "production" && !user.email_verified_at) return null;
        if (!await bcrypt.compare(parsed.data.password, String(user.password_hash))) return null;
        return {
          id: String(user.id),
          email: String(user.email),
          role: String(user.role),
          authVersion: Number(user.auth_version)
        };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      if (user && "role" in user) token.role = String(user.role);
      if (user && "authVersion" in user) token.authVersion = Number(user.authVersion);
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? token.sub ?? "");
        session.user.role = String(token.role ?? "USER");
        session.user.authVersion = Number(token.authVersion ?? 0);
      }
      return session;
    }
  }
});
