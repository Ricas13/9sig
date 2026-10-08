import Decimal from "decimal.js";
import type { EngineContext, StrategyEngine, ProposedAction, TrustedHistoricalSeries } from "./types";

type Config = {
  riskAssets: string[];
  defensiveAsset: string;
  lookbackMonths: number;
  reviewFrequency: "MONTHLY";
  minimumAbsoluteReturn: string;
};
const block = (ctx:EngineContext, reason:string):ProposedAction=>({
  actionType:"DATA_REQUIRED",title:"Momentum signal unavailable",instruction:reason,
  explanation:[{label:"Signal",value:"Unavailable"}],nextState:ctx.state,
  confidence:"LOW",dueAt:ctx.now
});
function parse(raw:Record<string,unknown>):Config {
  const riskAssets=raw.riskAssets;
  const defensiveAsset=raw.defensiveAsset;
  if(!Array.isArray(riskAssets)||riskAssets.length<2||riskAssets.some(x=>typeof x!=="string"||!x.trim())
    ||new Set(riskAssets).size!==riskAssets.length||typeof defensiveAsset!=="string"||!defensiveAsset.trim()
    ||riskAssets.includes(defensiveAsset))throw new Error("INVALID_MOMENTUM_UNIVERSE");
  const lookbackMonths=Number(raw.lookbackMonths);
  if(!Number.isInteger(lookbackMonths)||lookbackMonths<1||lookbackMonths>24)throw new Error("INVALID_MOMENTUM_LOOKBACK");
  if(raw.reviewFrequency!=="MONTHLY")throw new Error("INVALID_MOMENTUM_FREQUENCY");
  const threshold=new Decimal(String(raw.minimumAbsoluteReturn??""));
  if(!threshold.isFinite()||threshold.lt("-1")||threshold.gt("10"))throw new Error("INVALID_MOMENTUM_HURDLE");
  return {riskAssets:[...riskAssets],defensiveAsset,lookbackMonths,reviewFrequency:"MONTHLY",minimumAbsoluteReturn:threshold.toString()};
}
function signal(series:TrustedHistoricalSeries, now:Date, months:number):Decimal|null {
  const sorted=[...series.points].sort((a,b)=>a.at.getTime()-b.at.getTime());
  if(!sorted.length||!series.source||sorted.some(p=>!Number.isFinite(p.at.getTime())||p.at>now||!p.adjustedClose.isFinite()||p.adjustedClose.lte(0)))return null;
  if(sorted.some((p,i)=>i>0&&p.at.getTime()===sorted[i-1].at.getTime()))return null;
  const last=sorted[sorted.length-1];
  // Last observed price must be within 7 calendar days of the review timestamp.
  if(now.getTime()-last.at.getTime()>7*86400_000)return null;
  const target=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months,now.getUTCDate(),now.getUTCHours(),now.getUTCMinutes()));
  // Historical observation must be within 7 days at or before the anniversary.
  const old=[...sorted].reverse().find(p=>p.at<=target);
  if(!old||target.getTime()-old.at.getTime()>7*86400_000)return null;
  return last.adjustedClose.div(old.adjustedClose).minus(1);
}
/** Generic, research-stage absolute/relative momentum engine; no automated customer activation. */
export const momentumRotationEngine:StrategyEngine={
  key:"MOMENTUM_ROTATION",
  validateConfig(raw){parse(raw);},
  calculate(ctx){
    const config=parse(ctx.config);
    if(ctx.dataHealth.status!=="CURRENT")return block(ctx,"Current market data is missing or stale.");
    if(!ctx.reviewDue)return {actionType:"NO_ACTION",title:"Next monthly review is not due",instruction:"Keep the current allocation until the next review.",explanation:[],nextState:ctx.state,confidence:"HIGH",dueAt:ctx.nextReviewAt};
    if(!ctx.trustedHistory)return block(ctx,"Licensed historical price series have not been supplied.");
    const universe=[...config.riskAssets,config.defensiveAsset];
    const scores=new Map<string,Decimal>();
    for(const exposure of universe){
      const matches=ctx.trustedHistory.filter(s=>s.exposure===exposure&&s.currency===ctx.baseCurrency);
      if(matches.length!==1)return block(ctx,"Missing or ambiguous base-currency history for "+exposure+".");
      const value=signal(matches[0],ctx.now,config.lookbackMonths);
      if(!value)return block(ctx,"Insufficient or stale adjusted history for "+exposure+".");
      scores.set(exposure,value);
    }
    const ranked=config.riskAssets.map(exposure=>({exposure,score:scores.get(exposure)!}))
      .sort((a,b)=>b.score.cmp(a.score)||a.exposure.localeCompare(b.exposure));
    const winner=ranked[0].score.gt(config.minimumAbsoluteReturn)?ranked[0].exposure:config.defensiveAsset;
    const holdings=ctx.exposures.filter(x=>!x.value.eq(0));
    if(holdings.some(x=>!universe.includes(x.economicExposure)))return block(ctx,"Unclassified holding requires reconciliation before rotation.");
    const current=holdings.find(x=>x.economicExposure===winner)?.value??new Decimal(0);
    const total=holdings.reduce((s,x)=>s.plus(x.value),ctx.cash);
    if(!total.isFinite()||total.lte(0))return block(ctx,"Portfolio is empty or invalid.");
    const others=holdings.filter(x=>x.economicExposure!==winner);
    const explanation=[{label:"Selected exposure",value:winner},{label:"Relative leader return",value:ranked[0].score.mul(100).toFixed(2)+"%"},{label:"Absolute hurdle",value:new Decimal(config.minimumAbsoluteReturn).mul(100).toFixed(2)+"%"}];
    if(others.length){
      const first=[...others].sort((a,b)=>b.value.cmp(a.value))[0];
      if(first.value.lte(0))return block(ctx,"Cannot determine safe sale for negative holdings.");
      return {actionType:"SELL",title:"Rotate out of "+first.economicExposure,
        instruction:"Sell the existing "+first.economicExposure+" position, confirm the actual fill, then recalculate before buying "+winner+".",
        amount:first.value,currency:ctx.baseCurrency,economicExposure:first.economicExposure,
        explanation,nextState:{...ctx.state,proposedWinner:winner},confidence:"HIGH",dueAt:ctx.now,completesReview:false};
    }
    if(ctx.cash.gt(0)){
      return {actionType:"BUY",title:"Allocate to "+winner,instruction:"Buy "+ctx.cash.toFixed(2)+" "+ctx.baseCurrency+" of "+winner+" and confirm the actual fill.",
        amount:ctx.cash,currency:ctx.baseCurrency,economicExposure:winner,explanation,
        nextState:{...ctx.state,proposedWinner:winner},confidence:"HIGH",dueAt:ctx.now,completesReview:true};
    }
    if(current.eq(total))return {actionType:"HOLD",title:"Momentum allocation on target",instruction:"No trade is required.",explanation,
      nextState:{...ctx.state,proposedWinner:winner},confidence:"HIGH",dueAt:ctx.now,completesReview:true};
    return block(ctx,"The positions require reconciliation.");
  }
};
