export type ActionCopyInput = {
  actionType?: string | null;
  instruction?: string | null;
};

export function plainEnglishActionReason(action: ActionCopyInput): string {
  const type = String(action.actionType ?? "").toUpperCase();

  switch (type) {
    case "BUY":
      return "Your strategy wants more of this exposure. This order moves you closer to its target.";
    case "SELL":
      return "Your strategy wants less of this exposure. This order moves you back toward its target.";
    case "REBALANCE":
      return "Your holdings have drifted from the strategy target, so a rebalance is due.";
    case "HOLD":
      return "Your portfolio is close enough to target, so no trade is needed.";
    case "NO_ACTION":
      return "Nothing needs changing yet. We’ll check again at the next review.";
    case "DATA_REQUIRED":
      return "We’re missing reliable information, so we’re waiting rather than guessing with your money.";
    default:
      return action.instruction?.trim()
        ? "This is the next step produced by your strategy rules."
        : "We’ll show a clear reason whenever an action is required.";
  }
}
