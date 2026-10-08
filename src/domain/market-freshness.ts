/** Pure freshness classification safe for testing without server runtime. */
export function classifyFreshness(observedAt: Date, now = new Date(), maxAgeHours = 36) {
  const hours = (now.getTime() - observedAt.getTime()) / 3_600_000;
  return Number.isFinite(hours) && hours >= 0 && hours <= maxAgeHours ? "CURRENT" : "STALE";
}
