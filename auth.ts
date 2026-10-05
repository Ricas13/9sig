import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "@/lib/db";

const credentialsSchema=z.object({email:z.string().email(),password:z.string().min(8).max(128)});

export const {handlers,auth,signIn,signOut}=NextAuth({
  session:{strategy:"jwt"}, pages:{signIn:"/login"},
  providers:[Credentials({
    credentials:{email:{},password:{}},
    async authorize(raw) {
      const parsed=credentialsSchema.safeParse(raw); if(!parsed.success) return null;
      const [user]=await sql`SELECT id,email,password_hash FROM users WHERE lower(email)=lower(${parsed.data.email}) LIMIT 1`;
      if(!user) return null;
      if(!await bcrypt.compare(parsed.data.password,user.password_hash as string)) return null;
      return {id:user.id as string,email:user.email as string};
    }
  })],
  callbacks:{
    jwt({token,user}) { if(user?.id) token.uid=user.id; return token; },
    session({session,token}) { if(session.user) session.user.id=String(token.uid??token.sub??""); return session; },
  },
});