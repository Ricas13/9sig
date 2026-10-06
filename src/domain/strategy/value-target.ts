import Decimal from "decimal.js";
import type { EngineContext, ProposedAction, StrategyEngine } from "./types";

function num(config: Record<string, unknown>, key: string, fallback: string) {
  return new Decimal(String(config[key] ?? fallback));
}
function money(v: Decimal) { return v.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2); }

export const valueTargetEngine: StrategyEngine = {
  key: "VALUE_TARGET",
  calculate(ctx: EngineContext): ProposedAction {
    if (ctx.dataHealth.status !== "CURRENT") {
      return { actionType:"DATA_REQUIRED",title:"Data needs attention",instruction:ctx.dataHealth.message ?? "Current source data is not reliable enough to calculate a financial action.",explanation:[{label:"Data status",value:ctx.dataHealth.status,kind:"text"}],nextState:ctx.state,confidence:"LOW",dueAt:ctx.nextReviewAt };
    }
    if (!ctx.reviewDue) {
      return { actionType:"NO_ACTION",title:"Everything is on track",instruction:"No strategy review is due yet.",explanation:ctx.nextReviewAt?[{label:"Next review",value:ctx.nextReviewAt.toISOString(),kind:"text"}]:[],nextState:ctx.state,confidence:"HIGH",dueAt:ctx.nextReviewAt };
    }

    const exposureKey=String(ctx.config.targetExposure ?? "");
    const exposure=ctx.exposures.find((x)=>x.economicExposure===exposureKey);
    const current=exposure?.value ?? new Decimal(0);
    const isInitial=ctx.state.targetValue == null;
    const previousTarget=new Decimal(String(ctx.state.targetValue ?? current.toString()));
    const target=isInitial
      ? current.plus(ctx.cash).mul(num(ctx.config,"initialTargetRatio","0.60"))
      : previousTarget.mul(new Decimal(1).plus(num(ctx.config,"targetRate","0"))).plus(ctx.contributionsSinceReview.mul(num(ctx.config,"contributionTargetRatio","0")));
    const gap=target.minus(current);
    const threshold=target.abs().mul(num(ctx.config,"tolerance","0.01"));
    const explanation=[
      {label:"Current strategy value",value:money(current),kind:"money" as const},
      {label:isInitial?"Initial target":"Review target",value:money(target),kind:"money" as const},
      {label:"New contributions",value:money(ctx.contributionsSinceReview),kind:"money" as const},
      {label:"Calculated adjustment",value:money(gap),kind:"money" as const}
    ];
    const nextState={...ctx.state,targetValue:target.toString(),lastCalculatedAt:ctx.now.toISOString()};

    if(gap.abs().lte(threshold)) return {actionType:"HOLD",title:"No trade required",instruction:"The current exposure is within the strategy tolerance.",explanation,nextState,confidence:"HIGH",dueAt:ctx.now};
    if(gap.gt(0)){
      const amount=Decimal.min(gap,ctx.cash.mul(num(ctx.config,"maxCashUse","1")));
      if(amount.lte(0)) return {actionType:"DATA_REQUIRED",title:"Contribution or cash is required",instruction:"The strategy calls for more exposure, but there is no available cash recorded.",explanation,nextState:ctx.state,confidence:"HIGH",dueAt:ctx.now};
      return {actionType:"BUY",title:"Buy "+money(amount)+" of the target exposure",instruction:"Under the strategy rules you selected, add "+money(amount)+" "+ctx.baseCurrency+" of "+exposureKey+" exposure.",amount,currency:ctx.baseCurrency,economicExposure:exposureKey,explanation,nextState,confidence:"HIGH",dueAt:ctx.now};
    }
    const amount=gap.abs();
    return {actionType:"SELL",title:"Sell "+money(amount)+" of the target exposure",instruction:"Under the strategy rules you selected, reduce "+exposureKey+" exposure by "+money(amount)+" "+ctx.baseCurrency+".",amount,currency:ctx.baseCurrency,economicExposure:exposureKey,explanation,nextState,confidence:"HIGH",dueAt:ctx.now};
  }
};
