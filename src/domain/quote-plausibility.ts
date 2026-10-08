// A provider can return a price that is well-formed but wrong: pence quoted as pounds (100x), a
// dropped decimal, a split not yet applied. Feeding that into an action would size real orders from
// it, so a quote that jumps further than any real session could move is rejected and surfaced as a
// failed refresh until a person looks at it (a manual price with evidence can still be recorded).
export type QuoteAssessment = { ok: true } | { ok: false; code: "NON_POSITIVE_PRICE" | "IMPLAUSIBLE_MOVE" };

export function assessQuote(price: number, previous: { price: number; observedAt: Date } | null, now: Date, maxMove = 0.5): QuoteAssessment {
  if (!Number.isFinite(price) || price <= 0) return { ok: false, code: "NON_POSITIVE_PRICE" };
  // Only a recent reference is meaningful; after a long gap a large move can be genuine.
  if (!previous || !(previous.price > 0) || now.getTime() - previous.observedAt.getTime() > 7 * 86_400_000) return { ok: true };
  const move = Math.abs(price / previous.price - 1);
  return move > maxMove ? { ok: false, code: "IMPLAUSIBLE_MOVE" } : { ok: true };
}
