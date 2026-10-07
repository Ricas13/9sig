import Decimal from "decimal.js";

export type ContributionFrequency="WEEKLY"|"MONTHLY"|"QUARTERLY";

export type ContributionPlan={
  enabled:boolean;
  amount:string;
  frequency:ContributionFrequency;
  nextDate:string|null;
};

function validDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+"T00:00:00Z");
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}

export function addContributionPeriod(dateValue:string,frequency:ContributionFrequency){
  if(!validDate(dateValue))throw new Error("INVALID_CONTRIBUTION_DATE");
  const date=new Date(dateValue+"T00:00:00Z");
  if(frequency==="WEEKLY")date.setUTCDate(date.getUTCDate()+7);
  else if(frequency==="MONTHLY")date.setUTCMonth(date.getUTCMonth()+1);
  else date.setUTCMonth(date.getUTCMonth()+3);
  return date.toISOString().slice(0,10);
}

export function normalizeContributionPlan(raw:unknown,anchorDate=new Date()):ContributionPlan{
  const value=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
  const enabled=value.enabled===true||value.enabled==="true";
  const amount=new Decimal(String(value.amount??"0"));
  const frequency=String(value.frequency??"MONTHLY") as ContributionFrequency;
  if(!amount.isFinite()||amount.lt(0))throw new Error("INVALID_CONTRIBUTION_AMOUNT");
  if(!["WEEKLY","MONTHLY","QUARTERLY"].includes(frequency))throw new Error("INVALID_CONTRIBUTION_FREQUENCY");
  if(enabled&&amount.lte(0))throw new Error("INVALID_CONTRIBUTION_AMOUNT");

  let nextDate=value.nextDate==null||String(value.nextDate)===""?null:String(value.nextDate);
  if(nextDate&&!validDate(nextDate))throw new Error("INVALID_CONTRIBUTION_DATE");
  if(enabled&&!nextDate){
    const start=anchorDate.toISOString().slice(0,10);
    nextDate=addContributionPeriod(start,frequency);
  }
  return {enabled,amount:amount.toString(),frequency,nextDate:enabled?nextDate:null};
}

export function advanceContributionPlan(plan:ContributionPlan,throughDate:string){
  if(!plan.enabled||!plan.nextDate)return plan;
  if(!validDate(throughDate))throw new Error("INVALID_CONTRIBUTION_DATE");
  let next=plan.nextDate;
  while(next<=throughDate)next=addContributionPeriod(next,plan.frequency);
  return {...plan,nextDate:next};
}
