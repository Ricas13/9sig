export const DELIVERY_MAX_ATTEMPTS=8;

/** Backoff with a stable per-delivery jitter, avoiding synchronized provider retries. */
export function retryDelaySeconds(attempt:number,id:string,retryAfterSeconds?:number|null){
  if(!Number.isInteger(attempt)||attempt<1)throw new Error("INVALID_DELIVERY_ATTEMPT");
  const jitter=1+(Array.from(id).reduce((sum,ch)=>sum+ch.charCodeAt(0),0)%21)/100;
  const base=Math.min(3600,30*Math.pow(2,Math.min(attempt-1,8)));
  const provider=retryAfterSeconds!=null&&Number.isFinite(retryAfterSeconds)
    ?Math.max(0,retryAfterSeconds):0;
  return Math.min(3600,Math.ceil(Math.max(base,provider)*jitter));
}
