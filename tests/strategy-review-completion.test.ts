import {describe,it,expect} from "vitest";
import {postActionReviewState} from "@/domain/strategy/review-completion";

const now=new Date("2026-10-09T17:00:00Z");
const original={lastReviewAt:"2026-07-01T20:00:00.000Z",cashReserve:"80"};
const proposal={nextState:{lastCalculatedAt:"2026-10-09T17:00:00.000Z",completed:true}};
describe("review lifecycle follows verified fills, not target projection",()=>{
 it("keeps the review due after a buy, even when the engine projected completion",()=>{
  expect(postActionReviewState({...proposal,actionType:"BUY"},original,now))
    .toEqual({...original,forceReview:true});
 });
 it("does not advance when a sale was recorded but the corresponding purchase is still pending",()=>{
  expect(postActionReviewState({...proposal,actionType:"SELL"},original,now).lastReviewAt)
    .toBe(original.lastReviewAt);
 });
 it("keeps a multi-leg rebalance open until all actual broker quantities are reconciled",()=>{
  expect(postActionReviewState({...proposal,actionType:"REBALANCE"},original,now).forceReview).toBe(true);
 });
 it("closes a confirmed within-tolerance HOLD review exactly once",()=>{
  expect(postActionReviewState({...proposal,actionType:"HOLD"},original,now))
    .toMatchObject({...proposal.nextState,lastReviewAt:now.toISOString(),forceReview:false});
 });
 it("never changes review history on a missing-data or no-action calculation",()=>{
  expect(postActionReviewState({...proposal,actionType:"DATA_REQUIRED"},original,now)).toBe(proposal.nextState);
  expect(postActionReviewState({...proposal,actionType:"NO_ACTION"},original,now)).toBe(proposal.nextState);
 });
});
