import Decimal from "decimal.js";

export type LedgerEvent = {
  id?: string;
  eventType: string;
  cashAmount: string | number | Decimal;
  feeAmount?: string | number | Decimal;
  instrumentId?: string | null;
  quantity?: string | number | Decimal;
};

export type LedgerPosition = {
  cash: Decimal;
  quantities: Map<string, Decimal>;
};

export function foldLedger(events: LedgerEvent[]): LedgerPosition {
  let cash = new Decimal(0);
  const quantities = new Map<string, Decimal>();

  for (const event of events) {
    cash = cash.plus(new Decimal(event.cashAmount ?? 0)).minus(new Decimal(event.feeAmount ?? 0));
    if (event.instrumentId) {
      const previous = quantities.get(event.instrumentId) ?? new Decimal(0);
      quantities.set(event.instrumentId, previous.plus(new Decimal(event.quantity ?? 0)));
    }
  }

  return { cash, quantities };
}

export function monetary(value: Decimal.Value, dp = 2) {
  return new Decimal(value).toDecimalPlaces(dp, Decimal.ROUND_HALF_EVEN);
}

export function assertLedgerEvent(event: LedgerEvent) {
  const cash = new Decimal(event.cashAmount ?? 0);
  const qty = new Decimal(event.quantity ?? 0);
  if (!cash.isFinite() || !qty.isFinite()) throw new Error("Ledger event contains a non-finite number");
  if (event.eventType === "BUY" && (!event.instrumentId || qty.lte(0) || cash.gte(0))) {
    throw new Error("BUY must add units and reduce cash");
  }
  if (event.eventType === "SELL" && (!event.instrumentId || qty.gte(0) || cash.lte(0))) {
    throw new Error("SELL must remove units and add cash");
  }
  if (event.eventType === "CONTRIBUTION" && cash.lte(0)) throw new Error("CONTRIBUTION must increase cash");
  if (event.eventType === "WITHDRAWAL" && cash.gte(0)) throw new Error("WITHDRAWAL must reduce cash");
}
