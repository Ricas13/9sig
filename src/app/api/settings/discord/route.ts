import { z } from "zod";
import { sql } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { requireUser } from "@/lib/request-user";

const schema=z.object({webhook:z.string().url().refine((v)=>v.includes("discord.com/api/webhooks/")||v.includes("discordapp.com/api/webhooks/"),"Use a Discord webhook URL")});

export async function POST(request:Request) {
  try {
    const {user}=await requireUser(); const data=schema.parse(await request.json());
    await sql`UPDATE users SET discord_webhook_ciphertext=${encryptSecret(data.webhook)}, updated_at=now() WHERE id=${user.id}`;
    return Response.json({ok:true});
  } catch(error) {
    if(error instanceof z.ZodError) return Response.json({error:"Enter a valid Discord webhook URL."},{status:400});
    return Response.json({error:"Could not save Discord webhook."},{status:500});
  }
}
export async function DELETE() {
  try {
    const {user}=await requireUser();
    await sql`UPDATE users SET discord_webhook_ciphertext=NULL, updated_at=now() WHERE id=${user.id}`;
    return Response.json({ok:true});
  } catch { return Response.json({error:"Could not remove webhook."},{status:500}); }
}