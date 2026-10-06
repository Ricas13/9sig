export function parseExplicitInstant(value: string) {
  if (!/(Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)) throw new Error("TIMESTAMP_OFFSET_REQUIRED");
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime())) throw new Error("INVALID_TIMESTAMP");
  return parsed;
}

export function isoDateInZone(instant: Date, timeZone: string) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(instant);
  const get=(type:string)=>parts.find((p)=>p.type===type)?.value ?? "";
  return get("year")+"-"+get("month")+"-"+get("day");
}
