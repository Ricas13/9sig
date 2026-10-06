import Stripe from "stripe";
import { requireUser } from "@/lib/session";
import { sql } from "@/lib/db";
import { assertSameOrigin } from "@/lib/security";

export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    if(!process.env.STRIPE_SECRET_KEY||!process.env.NEXT_PUBLIC_APP_URL)return Response.json({error:"Billing is unavailable."},{status:503});
    const rows=await sql.unsafe("SELECT stripe_customer_id FROM subscriptions WHERE user_id=$1 LIMIT 1",[user.id]);
    if(!rows[0]?.stripe_customer_id)return Response.json({error:"No Stripe customer exists for this account."},{status:400});
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
    const session=await stripe.billingPortal.sessions.create({customer:String(rows[0].stripe_customer_id),return_url:process.env.NEXT_PUBLIC_APP_URL+"/app/settings"});
    return Response.json({url:session.url});
  }catch{
    return Response.json({error:"Could not open billing portal."},{status:500});
  }
}
