const DAY = 86_400_000;
const SIGNAL_DAYS = 91;

export function isoDate(input: Date | string) {
  const d = typeof input === "string" ? new Date(`${input}T00:00:00Z`) : input;
  return d.toISOString().slice(0, 10);
}
export function todayIso() { return isoDate(new Date()); }
export function addDays(date: string, days: number) {
  return isoDate(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY));
}
export function addMonths(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const max = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, max)); return isoDate(d);
}
export function signalOnOrBefore(date: string, anchor: string) {
  let cursor = anchor;
  if (date < anchor) { while (cursor > date) cursor = addDays(cursor, -SIGNAL_DAYS); return cursor; }
  while (addDays(cursor, SIGNAL_DAYS) <= date) cursor = addDays(cursor, SIGNAL_DAYS);
  return cursor;
}
export function nextSignalAfter(date: string, anchor: string) { return addDays(signalOnOrBefore(date, anchor), SIGNAL_DAYS); }
export function signalDatesBack(date: string, anchor: string, count: number) {
  const dates: string[] = []; let cursor = signalOnOrBefore(date, anchor);
  for (let i=0;i<count;i+=1) { dates.push(cursor); cursor=addDays(cursor,-SIGNAL_DAYS); }
  return dates;
}
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime()-new Date(`${a}T00:00:00Z`).getTime())/DAY);
}