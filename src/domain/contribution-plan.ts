import Decimal from "decimal.js";
import { localDateInZone } from "./schedule";

export type ContributionFrequency="WEEKLY"|"MONTHLY"|"QUARTERLY";

export type ContributionPlan={
  enabled:boolean;
  amount:string;
  frequency:ContributionFrequency;
  nextDate:string|null;
  // Only present for monthly/quarterly plans anchored on the 29th-31st. Short months clamp the
  // date, and the anchor lets later months return to it (Jan 31 > Feb 28 > Mar 31, not Mar 28).
  anchorDay?:number;
};

function validDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+"T00:00:00Z");
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}

function daysInMonth(year:number,monthZero:number){
  return new Date(Date.UTC(year,monthZero+1,0)).getUTCDate();
}

export function addContributionPeriod(dateValue:string,frequency:ContributionFrequency,anchorDay?:number){
  if(!validDate(dateValue))throw new Error("INVALID_CONTRIBUTION_DATE");
  const date=new Date(dateValue+"T00:00:00Z");
  if(frequency==="WEEKLY"){
    date.setUTCDate(date.getUTCDate()+7);
    return date.toISOString().slice(0,10);
  }
  const months=frequency==="MONTHLY"?1:3;
  const originalDay=Number.isInteger(anchorDay)&&anchorDay!>=29&&anchorDay!<=31?Math.max(anchorDay!,date.getUTCDate()):date.getUTCDate();
  const target=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+months,1));
  const lastDay=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(originalDay,lastDay));
  return target.toISOString().slice(0,10);
}

// `timeZone` is the user's: "today" for a new plan is their local date, not the UTC date.
export function normalizeContributionPlan(raw:unknown,anchorDate=new Date(),timeZone?:string):ContributionPlan{
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
    const start=timeZone?localDateInZone(anchorDate,timeZone):anchorDate.toISOString().slice(0,10);
    nextDate=addContributionPeriod(start,frequency);
  }
  const plan:ContributionPlan={enabled,amount:amount.toString(),frequency,nextDate:enabled?nextDate:null};
  const anchorDay=anchorDayFor(frequency,plan.nextDate,value.anchorDay);
  if(anchorDay)plan.anchorDay=anchorDay;
  return plan;
}

// Keeps a stored anchor while the date is still consistent with it (a clamped short month), and
// otherwise derives it from the date the user chose.
function anchorDayFor(frequency:ContributionFrequency,nextDate:string|null,stored:unknown){
  if(frequency==="WEEKLY"||!nextDate)return undefined;
  const day=Number(nextDate.slice(8,10));
  const stillClamped=Number.isInteger(stored)&&(stored as number)>=29&&(stored as number)<=31
    &&day===Math.min(stored as number,daysInMonth(Number(nextDate.slice(0,4)),Number(nextDate.slice(5,7))-1));
  if(stillClamped)return stored as number;
  return day>=29?day:undefined;
}

export function advanceContributionPlan(plan:ContributionPlan,throughDate:string){
  if(!plan.enabled||!plan.nextDate)return plan;
  if(!validDate(throughDate))throw new Error("INVALID_CONTRIBUTION_DATE");
  let next=plan.nextDate;
  while(next<=throughDate)next=addContributionPeriod(next,plan.frequency,plan.anchorDay);
  return {...plan,nextDate:next};
}
