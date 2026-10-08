import Stripe from "stripe";
import {z} from "zod";
import {requireAdmin} from "@/lib/session";
import {assertSameOrigin} from "@/lib/security";
import {getEmailProvider} from "@/lib/email";
import {getMarketDataProvider} from "@/lib/market-data";
import {sql} from "@/lib/db";
import { authFailure } from "@/lib/api-auth";

const schema=z.discriminatedUnion("service",[
 z.object({service:z.literal("STRIPE")}),
 z.object({service:z.literal("EMAIL")}),
 z.object({service:z.literal("MARKET_DATA"),symbol:z.string().regex(/^[A-Za-z0-9._:-]{1,32}$/)})
]);
/** Explicit admin-triggered tests; no arbitrary remote URLs or recipient addresses. */
export async function POST(request:Request){
 try{
  assertSameOrigin(request);
  const admin=await requireAdmin();
  const p=schema.parse(await request.json());
  let ok=false;
  let message="Connection failed.";
  try{
   if(p.service==="STRIPE"){
    const token=process.env.STRIPE_SECRET_KEY;
    if(!token)throw new Error("STRIPE_NOT_CONFIGURED");
    const balance=await new Stripe(token,{timeout:8000,maxNetworkRetries:0}).balance.retrieve();
    ok=Boolean(balance.object==="balance");
    message=ok?"Stripe authenticated successfully. This does not test billing webhooks.":"Stripe did not return an account.";
   }else if(p.service==="EMAIL"){
    if(process.env.EMAIL_PROVIDER!=="http"||!process.env.EMAIL_HTTP_ENDPOINT||!process.env.EMAIL_HTTP_TOKEN)throw new Error("EMAIL_NOT_CONFIGURED");
    ok=await getEmailProvider().send({to:admin.email,subject:"9sig admin email delivery test",text:"This is a one-time email connectivity test initiated by an administrator."});
    message=ok?"Provider accepted test email to your admin account; inbox delivery is not guaranteed.":"Email provider rejected test message.";
   }else{
    const provider=getMarketDataProvider();
    if(!provider.configured||provider.name==="mock")throw new Error("MARKET_DATA_NOT_CONFIGURED");
    const quote=await provider.currentPrice(p.symbol);
    ok=Boolean(quote&&quote.price&&quote.provider&&quote.currency&&quote.observedAt instanceof Date&&Number.isFinite(quote.observedAt.getTime())&&quote.observedAt.getTime()<=Date.now());
    message=ok?"Received a market observation. This does not prove historical coverage or data licensing.":"No usable quote returned.";
   }
  }catch(error){message=error instanceof Error?error.message.slice(0,100):"Connection test failed";}
  await sql.unsafe("INSERT INTO audit_events (actor_user_id,action,entity_type,metadata) VALUES ($1,'integration.connection-test','integration',$2::jsonb)",[
   admin.id,JSON.stringify({service:p.service,ok,code:ok?"CONNECTED":"TEST_FAILED"})
  ]);
  return Response.json({ok,message},{status:ok?200:503,headers:{"cache-control":"no-store"}});
 }catch(error){const denied=authFailure(error);if(denied)return denied;
  if(error instanceof z.ZodError)return Response.json({error:"Invalid connection test request."},{status:400});
  return Response.json({error:"Connection test unavailable."},{status:500});
 }
}
