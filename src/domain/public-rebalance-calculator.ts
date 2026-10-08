import Decimal from "decimal.js";
export type SimpleRebalance={
 total:string;currentValue:string;targetValue:string;targetPercent:string;
 delta:string;absoluteAmount:string;action:"BUY"|"SELL"|"HOLD";
};
/** Educational 2-asset portfolio weight calculator; not a strategy engine or executable order. */
export function calculateSimpleRebalance(totalInput:string,currentInput:string,targetPercentInput:string):SimpleRebalance{
 const total=new Decimal(totalInput),current=new Decimal(currentInput),percentage=new Decimal(targetPercentInput);
 if(!total.isFinite()||!current.isFinite()||!percentage.isFinite()||total.lt(0)||current.lt(0)||current.gt(total)||percentage.lt(0)||percentage.gt(100))
  throw new Error("INVALID_REBALANCE_INPUT");
 const target=total.mul(percentage).div(100);
 const delta=target.minus(current);
 const cents=delta.toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
 return {total:total.toFixed(2),currentValue:current.toFixed(2),targetValue:target.toFixed(2),targetPercent:percentage.toString(),
  delta:cents.toFixed(2),absoluteAmount:cents.abs().toFixed(2),action:cents.gt(0)?"BUY":cents.lt(0)?"SELL":"HOLD"};
}
