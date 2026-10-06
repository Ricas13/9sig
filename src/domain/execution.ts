import Decimal from "decimal.js";

export type TradeSide = "BUY" | "SELL";

export type ExecutionInput = {
  side: TradeSide;
  proposedAmount: Decimal.Value;
  price: Decimal.Value;
  quantity?: Decimal.Value | null;
  fee?: Decimal.Value | null;
  availableCash: Decimal.Value;
  heldQuantity: Decimal.Value;
  maxNotionalDeviation?: Decimal.Value;
};

export type ValidatedExecution = {
  quantity: Decimal;
  grossNotional: Decimal;
  fee: Decimal;
  cashAmount: Decimal;
  ledgerQuantity: Decimal;
};

export function validateExecution(input: ExecutionInput): ValidatedExecution {
  const proposed = new Decimal(input.proposedAmount);
  const price = new Decimal(input.price);
  const fee = new Decimal(input.fee ?? 0);
  const availableCash = new Decimal(input.availableCash);
  const heldQuantity = new Decimal(input.heldQuantity);
  const maxDeviation = new Decimal(input.maxNotionalDeviation ?? "0.02");

  if (!proposed.isFinite() || proposed.lte(0)) throw new Error("INVALID_PROPOSED_AMOUNT");
  if (!price.isFinite() || price.lte(0)) throw new Error("INVALID_PRICE");
  if (!fee.isFinite() || fee.lt(0)) throw new Error("INVALID_FEE");
  if (!availableCash.isFinite() || !heldQuantity.isFinite()) throw new Error("INVALID_ACCOUNT_STATE");

  const quantity = input.quantity == null
    ? proposed.div(price)
    : new Decimal(input.quantity);
  if (!quantity.isFinite() || quantity.lte(0)) throw new Error("INVALID_QUANTITY");

  const grossNotional = quantity.mul(price);
  const deviation = grossNotional.minus(proposed).abs().div(proposed);
  if (deviation.gt(maxDeviation)) throw new Error("EXECUTION_NOTIONAL_MISMATCH");

  if (input.side === "BUY") {
    const requiredCash = grossNotional.plus(fee);
    if (requiredCash.gt(availableCash)) throw new Error("INSUFFICIENT_CASH");
    return {
      quantity,
      grossNotional,
      fee,
      cashAmount: grossNotional.neg(),
      ledgerQuantity: quantity
    };
  }

  if (quantity.gt(heldQuantity)) throw new Error("INSUFFICIENT_HOLDINGS");
  return {
    quantity,
    grossNotional,
    fee,
    cashAmount: grossNotional,
    ledgerQuantity: quantity.neg()
  };
}
