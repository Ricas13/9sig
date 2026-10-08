import Decimal from "decimal.js";
/** Only provider-sourced historical observations can automatically value an entered trade. */
export type TradePriceEvidence={
  symbol:string; requestedAt:Date; observedAt:Date; price:string;currency:string;
  provider:string; granularity:"TRADE"|"MINUTE_BAR"|"DAILY_BAR";
  priceKind:"LAST"|"OPEN"|"HIGH"|"LOW"|"CLOSE";
};
export function validateHistoricalTradePrice(e:TradePriceEvidence, opts:{
  symbol:string;at:Date;currency:string;maxGapMinutes?:number;
}):{price:string;exact:boolean;description:string}{
 const maxGap=opts.maxGapMinutes??1;
 if(!e.symbol||e.symbol!==opts.symbol||e.currency!==opts.currency||!e.provider.trim()
  ||!Number.isFinite(e.requestedAt.getTime())||!Number.isFinite(e.observedAt.getTime())
  ||!Number.isFinite(opts.at.getTime())||e.requestedAt.getTime()!==opts.at.getTime()
  ||!new Decimal(e.price).isFinite()||new Decimal(e.price).lte(0))
  throw new Error("HISTORICAL_TRADE_PRICE_INVALID");
 if(e.granularity==="DAILY_BAR")throw new Error("HISTORICAL_TRADE_INTRADAY_REQUIRED");
 const gap=Math.abs(e.observedAt.getTime()-opts.at.getTime())/60000;
 if(!Number.isFinite(maxGap)||maxGap<0||gap>maxGap)throw new Error("HISTORICAL_TRADE_PRICE_TOO_FAR_FROM_EXECUTION");
 if(e.granularity==="TRADE" && e.priceKind!=="LAST")throw new Error("HISTORICAL_TRADE_PRICE_KIND_INVALID");
 return {price:new Decimal(e.price).toString(),exact:e.granularity==="TRADE"&&gap===0,
 description:e.granularity==="TRADE"&&gap===0?"Trade-time market observation (not necessarily user's broker fill)":"Nearby historical market observation; confirm actual broker fill and fees"};
}
