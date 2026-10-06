export type ActionStatus="CALCULATED"|"NOTIFIED"|"ACKNOWLEDGED"|"EXECUTED"|"RECONCILED"|"CANCELLED"|"SUPERSEDED";
const allowed:Record<ActionStatus,ActionStatus[]>={
  CALCULATED:["NOTIFIED","ACKNOWLEDGED","EXECUTED","CANCELLED","SUPERSEDED"],
  NOTIFIED:["ACKNOWLEDGED","EXECUTED","CANCELLED","SUPERSEDED"],
  ACKNOWLEDGED:["EXECUTED","CANCELLED","SUPERSEDED"],
  EXECUTED:["RECONCILED"],
  RECONCILED:[],
  CANCELLED:[],
  SUPERSEDED:[]
};
export function canTransitionAction(from:ActionStatus,to:ActionStatus){return allowed[from].includes(to);}
export function assertActionTransition(from:ActionStatus,to:ActionStatus){if(!canTransitionAction(from,to))throw new Error("INVALID_ACTION_TRANSITION");}
