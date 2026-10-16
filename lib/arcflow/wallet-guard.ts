/**
 * Phase 23.58 — pre-submission wallet guard.
 *
 * Pure, testable checks that run immediately before every
 * `eth_sendTransaction`. A mid-sequence chain switch or account change aborts
 * the run instead of silently submitting from — or against — the wrong wallet
 * context. Nothing here signs, sends, or switches networks.
 */

export type WalletGuardFailure =
  | { kind: "no-account" }
  | { kind: "account-changed"; expected: string; actual: string | null }
  | { kind: "wrong-chain"; expectedChainId: number; actualChainId: number | null };

/**
 * Returns `null` when the wallet is safe to submit from, otherwise the first
 * reason it is not. Comparison is case-insensitive for addresses.
 */
export function checkWalletForSubmission(input: {
  expectedChainId: number;
  expectedAccount: string | null;
  currentAccounts: readonly string[];
  currentChainId: number | null;
}): WalletGuardFailure | null {
  const { expectedChainId, expectedAccount, currentAccounts, currentChainId } = input;

  if (!expectedAccount) {
    return { kind: "no-account" };
  }

  const actual = currentAccounts[0] ?? null;
  if (!actual || actual.toLowerCase() !== expectedAccount.toLowerCase()) {
    return { kind: "account-changed", expected: expectedAccount, actual };
  }

  if (currentChainId !== expectedChainId) {
    return { kind: "wrong-chain", expectedChainId, actualChainId: currentChainId };
  }

  return null;
}

/** A clear, user-facing message. Never silently switches chain or account. */
export function walletGuardFailureMessage(failure: WalletGuardFailure): string {
  switch (failure.kind) {
    case "no-account":
      return "Wallet not connected. Connect your wallet and try again.";
    case "account-changed":
      return (
        `The selected wallet account changed (expected ${failure.expected}, ` +
        `now ${failure.actual ?? "none"}). Re-select the original account and try again. ` +
        "No transaction was sent."
      );
    case "wrong-chain":
      return (
        `The wallet is no longer on chain ${failure.expectedChainId} ` +
        `(now ${failure.actualChainId ?? "unknown"}). Switch back to Arc mainnet and try again. ` +
        "No transaction was sent."
      );
  }
}
