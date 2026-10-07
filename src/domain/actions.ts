export type ActionStatus="CALCULATED"|"NOTIFIED"|"ACKNOWLEDGED"|"EXECUTED"|"RECONCILED"|"CANCELLED"|"SUPERSEDED";
const allowed:Record<ActionStatus,ActionStatus[]>={
  CALCULATED:["NOTIFIED","ACKNOWLEDGED","EXECUTED","CANCELLED","SUPERSEDED"],
  NOTIFIED:["ACKNOWLEDGED","EXECUTED","CANCELLED","SUPERSEDED"],
  ACKNOWLEDGED:["EXECUTED","CANCELLED","SUPERSEDED"],
  EXECUTED:["RECONCILED"],
  RECONCILED:[],
  CANCELLED:["CALCULATED"],
  SUPERSEDED:["CALCULATED"]
};
export function canTransitionAction(from:ActionStatus,to:ActionStatus){return allowed[from].includes(to);}
export function assertActionTransition(from:ActionStatus,to:ActionStatus){if(!canTransitionAction(from,to))throw new Error("INVALID_ACTION_TRANSITION");}

export function actionRecalculationDisposition(previous:ActionStatus|null){
  if(previous==null)return {status:"CALCULATED" as const,shouldNotify:true};
  if(previous==="CANCELLED"||previous==="SUPERSEDED")return {status:"CALCULATED" as const,shouldNotify:true};
  return {status:previous,shouldNotify:false};
}
