export type LatestAccountReconciliation = {
  accountId: string | null;
  difference: string;
  reason: string | null;
  resolved: boolean;
};

export function summarizeReconciliationState(
  latest: LatestAccountReconciliation[],
  resumeNeedsReconciliation: boolean
) {
  const unresolved=latest.filter((row)=>!row.resolved);
  const strategyResolved=unresolved.length===0&&!resumeNeedsReconciliation;
  return {
    strategyResolved,
    state: strategyResolved
      ? null
      : {
          accounts:unresolved.map((row)=>({
            accountId:row.accountId,
            difference:row.difference,
            reason:row.reason??"Unknown adjustment"
          })),
          resumeNeedsReconciliation
        }
  };
}
