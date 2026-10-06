import Decimal from "decimal.js";

export type LedgerEvent = {
  id?: string;
  eventType: string;
  currency?: string | null;
  cashAmount: string | number | Decimal;
  feeAmount?: string | number | Decimal;
  instrumentId?: string | null;
  tradingLineId?: string | null;
  quantity?: string | number | Decimal;
};

export type LedgerPosition = {
  cash: Decimal;
  cashByCurrency: Map<string, Decimal>;
  quantities: Map<string, Decimal>;
  tradingLineQuantities: Map<string, Decimal>;
};

export function foldLedger(events: LedgerEvent[], baseCurrency?: string): LedgerPosition {
  const cashByCurrency = new Map<string, Decimal>();
  const quantities = new Map<string, Decimal>();
  const tradingLineQuantities = new Map<string, Decimal>();

  for (const event of events) {
    const currency = String(event.currency ?? baseCurrency ?? "__UNSPECIFIED__").toUpperCase();
    const previousCash = cashByCurrency.get(currency) ?? new Decimal(0);
    const delta = new Decimal(event.cashAmount ?? 0).minus(new Decimal(event.feeAmount ?? 0));
    cashByCurrency.set(currency, previousCash.plus(delta));

    if (event.instrumentId) {
      const previous = quantities.get(event.instrumentId) ?? new Decimal(0);
      quantities.set(event.instrumentId, previous.plus(new Decimal(event.quantity ?? 0)));
    }
    if (event.tradingLineId) {
      const previousLine = tradingLineQuantities.get(event.tradingLineId) ?? new Decimal(0);
      tradingLineQuantities.set(event.tradingLineId, previousLine.plus(new Decimal(event.quantity ?? 0)));
    }
  }

  let cash = new Decimal(0);
  if (baseCurrency) {
    cash = cashByCurrency.get(baseCurrency.toUpperCase()) ?? new Decimal(0);
  } else if (cashByCurrency.size === 1) {
    cash = [...cashByCurrency.values()][0];
  } else if (cashByCurrency.size > 1) {
    throw new Error("BASE_CURRENCY_REQUIRED_FOR_MULTI_CURRENCY_LEDGER");
  }

  return { cash, cashByCurrency, quantities, tradingLineQuantities };
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
