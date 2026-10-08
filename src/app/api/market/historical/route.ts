import {z} from "zod";
import {requireUser} from "@/lib/session";
import {assertSameOrigin,consumeRateLimit} from "@/lib/security";
import {sql} from "@/lib/db";
import {getMarketDataProvider} from "@/lib/market-data";
import {validateHistoricalTradePrice} from "@/domain/historical-trade-price";
import {exchangeTradingDate} from "@/domain/historical-trade";
import { authFailure } from "@/lib/api-auth";
const inputSchema=z.object({
 accountId:z.string().uuid(),
 ticker:z.string().regex(/^[A-Za-z0-9.^_-]{1,24}$/),
 exchange:z.string().regex(/^[A-Za-z0-9._-]{1,24}$/),
 executedAt:z.string().datetime({offset:true})
});
export async function POST(request:Request){
 try{
  assertSameOrigin(request);
  const user=await requireUser();
  await consumeRateLimit("historical-quote:"+user.id,12,60);
  const p=inputSchema.parse(await request.json());
  const at=new Date(p.executedAt);
  if(!Number.isFinite(at.getTime())||at.getTime()>Date.now()||at.getTime()<Date.UTC(1990,0,1))
   return Response.json({error:"Choose a valid past trade timestamp including its timezone offset."},{status:400});
  const tradingDate=exchangeTradingDate(at,p.exchange);
  // The account must belong to an active or paused user-owned strategy. No guessed ticker mapping.
  const rows=await sql.unsafe(
   "SELECT DISTINCT tl.id,tl.ticker,tl.currency,tl.provider_symbol FROM strategy_instances si "+
   "JOIN strategy_accounts sa ON sa.strategy_instance_id=si.id "+
   "JOIN accounts a ON a.id=sa.account_id "+
   "JOIN trading_lines tl ON upper(tl.ticker)=upper($3) AND upper(tl.exchange)=upper($4) AND upper(tl.currency)=upper(a.currency) "+
   "WHERE si.user_id=$1 AND si.status IN ('ACTIVE','PAUSED') AND sa.account_id=$2 "+
   "AND tl.effective_from<=$5::date AND (tl.effective_to IS NULL OR tl.effective_to>=$5::date) LIMIT 2",
   [user.id,p.accountId,p.ticker,p.exchange,tradingDate]);
  if(rows.length!==1)return Response.json({error:"No unambiguous trading line in this account and currency at that date."},{status:422});
  const row=rows[0];
  if(!row.provider_symbol)return Response.json({error:"Historical price provider mapping is not configured."},{status:503});
  const provider=getMarketDataProvider();
  if(!provider.configured||provider.name==="mock")return Response.json({error:"Historical price provider is unavailable."},{status:503});
  const observation=await provider.historicalPrice(String(row.provider_symbol),at);
  if(!observation||!observation.granularity||!observation.priceKind)
   return Response.json({error:"The provider did not supply verifiable intraday price resolution."},{status:422});
  try{
   const validated=validateHistoricalTradePrice({
    symbol:String(row.ticker),requestedAt:at,observedAt:observation.observedAt,
    price:observation.price,currency:observation.currency,provider:observation.provider,
    granularity:observation.granularity,priceKind:observation.priceKind
   },{symbol:String(row.ticker),at,currency:String(row.currency).toUpperCase()});
   return Response.json({ok:true,price:validated.price,currency:String(row.currency),observedAt:observation.observedAt.toISOString(),
    granularity:observation.granularity,priceKind:observation.priceKind,exactMarketObservation:validated.exact,
    source:observation.provider,note:validated.description,
    disclaimer:"Market observation only. Confirm the broker's executed price, quantity, fees and foreign exchange."},
    {headers:{"cache-control":"private, no-store"}});
  }catch{
   return Response.json({error:"Historical observation is too coarse, stale or inconsistent with the requested trade."},{status:422});
  }
 }catch(error){const denied=authFailure(error);if(denied)return denied;
  if(error instanceof z.ZodError)return Response.json({error:"Enter a valid account, ticker, exchange and ISO timestamp with timezone."},{status:400});
  if(error instanceof Error&&error.message==="UNSUPPORTED_EXCHANGE_TIMEZONE")return Response.json({error:"Exchange timezone has not yet been verified."},{status:422});
  if(error instanceof Error&&error.message==="RATE_LIMITED")return Response.json({error:"Too many requests. Retry later."},{status:429});
  return Response.json({error:"Historical price lookup failed."},{status:503});
 }
}
