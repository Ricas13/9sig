import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "@/lib/db";
import { consumeRateLimit } from "@/lib/security";

const credentials = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        try {
          await consumeRateLimit("login:" + parsed.data.email.toLowerCase(), 12, 15 * 60);
        } catch {
          return null;
        }
        const rows = await sql.unsafe(
          "SELECT id,email,password_hash,email_verified_at,role FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL LIMIT 1",
          [parsed.data.email]
        );
        const user = rows[0];
        if (!user) return null;
        if (process.env.NODE_ENV === "production" && !user.email_verified_at) return null;
        if (!await bcrypt.compare(parsed.data.password, String(user.password_hash))) return null;
        return { id: String(user.id), email: String(user.email), role: String(user.role) };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      if (user && "role" in user) token.role = String(user.role);
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? token.sub ?? "");
        session.user.role = String(token.role ?? "USER");
      }
      return session;
    }
  }
});
