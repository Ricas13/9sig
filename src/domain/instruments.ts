import Decimal from "decimal.js";

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
  tradingLineCurrency: string;
  tradingLineEffectiveFrom: string;
  tradingLineEffectiveTo: string | null;
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
    new Decimal(c.leverage).eq(new Decimal(request.leverage)) &&
    c.direction === request.direction &&
    c.country === request.country &&
    c.wrapper === request.wrapper &&
    c.fidelity === "EXACT" &&
    c.effectiveFrom <= request.asOf &&
    (!c.effectiveTo || c.effectiveTo >= request.asOf) &&
    c.tradingLineEffectiveFrom <= request.asOf &&
    (!c.tradingLineEffectiveTo || c.tradingLineEffectiveTo >= request.asOf) &&
    (!request.preferredCurrency || c.tradingLineCurrency === request.preferredCurrency) &&
    (!c.broker || (!!request.broker && c.broker.toLowerCase() === request.broker.toLowerCase()))
  );

  const ranked = eligible.sort((a,b) => {
    const brokerA = a.broker && request.broker && a.broker.toLowerCase() === request.broker.toLowerCase() ? 1 : 0;
    const brokerB = b.broker && request.broker && b.broker.toLowerCase() === request.broker.toLowerCase() ? 1 : 0;
    if (brokerA !== brokerB) return brokerB - brokerA;
    const configuredCurrencyA = a.preferredCurrency === request.preferredCurrency ? 1 : 0;
    const configuredCurrencyB = b.preferredCurrency === request.preferredCurrency ? 1 : 0;
    if (configuredCurrencyA !== configuredCurrencyB) return configuredCurrencyB - configuredCurrencyA;
    return b.effectiveFrom.localeCompare(a.effectiveFrom);
  });
  const chosen=ranked[0];
  if(!chosen)return null;
  const score=(c:MappingCandidate)=>({
    broker:Number(Boolean(c.broker&&request.broker&&c.broker.toLowerCase()===request.broker.toLowerCase())),
    currency:Number(c.preferredCurrency===request.preferredCurrency),
    effectiveFrom:c.effectiveFrom
  });
  const first=score(chosen);
  const equallyRanked=ranked.filter(c=>{
    const candidate=score(c);
    return candidate.broker===first.broker&&candidate.currency===first.currency&&candidate.effectiveFrom===first.effectiveFrom;
  });
  // If equally preferred mappings resolve to different trading lines,
  // never invent a deterministic investment choice from arbitrary DB ordering.
  return new Set(equallyRanked.map(c=>c.tradingLineId)).size===1?chosen:null;
}


export function exposureLeverage(exposure:string, explicit?:unknown){
  if(explicit!=null&&String(explicit).trim()){
    const leverage=new Decimal(String(explicit));
    if(!leverage.isFinite()||leverage.lte(0))throw new Error("INVALID_EXPOSURE_LEVERAGE");
    return leverage.toString();
  }
  const match=String(exposure).match(/(?:^|_)(\d+(?:\.\d+)?)X(?:_|$)/i);
  return match?new Decimal(match[1]).toString():"1";
}
