import type {ProposedAction} from "./types";

/**
 * A calculated trade is not a completed review. Closing a period based on estimated
 * quantities can skip a required leg after fees, partial fills or price changes.
 * The ledger mutation triggers another calculation, after which a HOLD confirmation
 * can advance the strategy's last review instant.
 */
export function postActionReviewState(
  proposed: Pick<ProposedAction,"actionType"|"nextState">,
  current:Record<string,unknown>,
  confirmedAt:Date
):Record<string,unknown>{
  if(["BUY","SELL","REBALANCE"].includes(proposed.actionType))
    return {...current,forceReview:true};
  if(proposed.actionType==="HOLD")
    return {...proposed.nextState,lastReviewAt:confirmedAt.toISOString(),forceReview:false};
  return proposed.nextState;
}
