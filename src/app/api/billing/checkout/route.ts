import Stripe from "stripe";
import { requireUser } from "@/lib/request-user";
import { sql } from "@/lib/db";

export async function POST() {
  try {
    const { user }=await requireUser();
    const secret=process.env.STRIPE_SECRET_KEY;
    const price=process.env.STRIPE_PRICE_ID;
    const base=process.env.NEXT_PUBLIC_APP_URL;
    if(!secret||!price||!base) return Response.json({error:"Billing is not configured yet."},{status:503});
    const stripe=new Stripe(secret);
    let customerId=user.stripeCustomerId;
    if(!customerId) {
      const customer=await stripe.customers.create({email:user.email,metadata:{userId:user.id}});
      customerId=customer.id;
      await sql`UPDATE users SET stripe_customer_id=${customerId}, updated_at=now() WHERE id=${user.id}`;
    }
    const session=await stripe.checkout.sessions.create({
      mode:"subscription",customer:customerId,line_items:[{price,quantity:1}],
      success_url:`${base}/?subscribed=1`,cancel_url:`${base}/?billing=cancelled`,
      allow_promotion_codes:true,metadata:{userId:user.id},subscription_data:{metadata:{userId:user.id}},
    });
    return Response.json({url:session.url});
  } catch { return Response.json({error:"Could not start checkout."},{status:500}); }
}