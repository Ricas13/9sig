export type MappingCandidate = {
  id: string;
  economicExposure: string;
  leverage: string;
  direction: string;
  country: string;
  wrapper: string;
  broker: string | null;
  preferredCurrency: string | null;
  fidelity: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  tradingLineId: string;
};

export type ResolveRequest = {
  economicExposure: string;
  leverage: string;
  direction: string;
  country: string;
  wrapper: string;
  broker?: string | null;
  preferredCurrency?: string | null;
  asOf: string;
};

export function resolveMapping(candidates: MappingCandidate[], request: ResolveRequest) {
  const eligible = candidates.filter((c) =>
    c.economicExposure === request.economicExposure &&
    c.leverage === request.leverage &&
    c.direction === request.direction &&
    c.country === request.country &&
    c.wrapper === request.wrapper &&
    c.fidelity === "EXACT" &&
    c.effectiveFrom <= request.asOf &&
    (!c.effectiveTo || c.effectiveTo >= request.asOf) &&
    (!c.broker || !request.broker || c.broker.toLowerCase() === request.broker.toLowerCase())
  );

  return eligible.sort((a,b) => {
    const brokerA = a.broker && request.broker && a.broker.toLowerCase() === request.broker.toLowerCase() ? 1 : 0;
    const brokerB = b.broker && request.broker && b.broker.toLowerCase() === request.broker.toLowerCase() ? 1 : 0;
    if (brokerA !== brokerB) return brokerB - brokerA;
    const currencyA = a.preferredCurrency === request.preferredCurrency ? 1 : 0;
    const currencyB = b.preferredCurrency === request.preferredCurrency ? 1 : 0;
    if (currencyA !== currencyB) return currencyB - currencyA;
    return b.effectiveFrom.localeCompare(a.effectiveFrom);
  })[0] ?? null;
}
