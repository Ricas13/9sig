import Stripe from "stripe";
import { requireUser } from "@/lib/request-user";

export async function POST() {
  try {
    const {user}=await requireUser();
    if(!process.env.STRIPE_SECRET_KEY||!user.stripeCustomerId||!process.env.NEXT_PUBLIC_APP_URL) {
      return Response.json({error:"Billing portal is unavailable."},{status:400});
    }
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
    const session=await stripe.billingPortal.sessions.create({customer:user.stripeCustomerId,return_url:process.env.NEXT_PUBLIC_APP_URL});
    return Response.json({url:session.url});
  } catch { return Response.json({error:"Could not open billing portal."},{status:500}); }
}