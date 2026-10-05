import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "@/lib/db";

const schema=z.object({email:z.string().email(),password:z.string().min(8).max(128)});

export async function POST(request:Request) {
  try {
    const data=schema.parse(await request.json());
    const passwordHash=await bcrypt.hash(data.password,12);
    const [user]=await sql`
      INSERT INTO users (email,password_hash)
      VALUES (${data.email.toLowerCase()},${passwordHash})
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `;
    if(!user) return Response.json({error:"An account with that email already exists."},{status:409});
    await sql`INSERT INTO portfolios (user_id) VALUES (${user.id})`;
    return Response.json({ok:true},{status:201});
  } catch(error) {
    if(error instanceof z.ZodError) return Response.json({error:"Enter a valid email and a password of at least 8 characters."},{status:400});
    return Response.json({error:"Could not create account."},{status:500});
  }
}