import { rebuildAnonymousAggregates } from "@/lib/aggregate-service";

function authorized(request:Request){
  return Boolean(process.env.CRON_SECRET)&&request.headers.get("authorization")==="Bearer "+process.env.CRON_SECRET;
}

export async function GET(request:Request){
  if(!authorized(request))return new Response("Unauthorized",{status:401});
  const result=await rebuildAnonymousAggregates();
  return Response.json({ok:true,...result});
}
