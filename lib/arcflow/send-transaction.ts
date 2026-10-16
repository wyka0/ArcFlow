/**
 * Phase 23.59 — testable core of the wallet transaction sender.
 *
 * `useTransactionSender` (a React hook) delegates here so the exact
 * pre-submission guard, EIP-1193 submission, and receipt classification can be
 * exercised against a mocked provider without a DOM. The hook adds only React
 * state (`isSending`/`error`) around this function.
 *
 * Guarantees:
 *  - The wallet is re-checked (chain + account) immediately before EVERY send.
 *  - Standards-compatible EIP-1193 params: no non-standard `chainId` field.
 *  - A confirmed revert is a failure; a timeout / RPC error is an UNKNOWN
 *    outcome surfaced as `UnknownTransactionOutcomeError` — never a confirmed
 *    failure and never automatically resubmitted.
 */

import type { Eip1193Provider } from "@/lib/wallet/client";
import { getAccounts, getChainId } from "@/lib/wallet/client";
import { toWalletError } from "@/lib/wallet/state";
import type { MinimalReceiptLog, UsdcReceiptOutcome } from "@/lib/arc/payment";
import type { PreparedTransaction } from "./interactions";
import { checkWalletForSubmission, walletGuardFailureMessage } from "./wallet-guard";

/**
 * Run a raw provider interaction and, on failure, throw a user-safe error.
 *
 * Provider/RPC errors can carry verbose or implementation-specific text. We
 * normalize ONLY at this boundary, using the existing wallet-error mapping, so
 * a raw provider message never reaches the UI. Errors thrown by our own logic
 * (guard, revert, unknown outcome) are raised outside this wrapper and are
 * therefore never normalized a second time.
 */
async function viaProvider<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new Error(toWalletError(error).message);
  }
}

export interface SubmittedTransaction {
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  logs: readonly MinimalReceiptLog[];
}

/**
 * Thrown when a transaction was submitted but its outcome could not be
 * confirmed (receipt wait timed out, or the RPC became unavailable). The
 * transaction may still confirm on-chain: callers must NOT present this as a
 * confirmed failure and must NOT resubmit automatically.
 */
export class UnknownTransactionOutcomeError extends Error {
  readonly kind = "unknown-outcome" as const;
  readonly transactionHash: `0x${string}`;

  constructor(message: string, transactionHash: `0x${string}`) {
    super(message);
    this.name = "UnknownTransactionOutcomeError";
    this.transactionHash = transactionHash;
  }
}

export interface SubmitTransactionInput {
  provider: Eip1193Provider;
  transaction: PreparedTransaction;
  /** The account the wallet must still have selected. */
  expectedAccount: string | null;
  /** Waits for and classifies the confirmed receipt for a submitted hash. */
  verify: (hash: `0x${string}`) => Promise<UsdcReceiptOutcome>;
}

/**
 * Submit one prepared transaction and return its confirmed receipt outcome.
 *
 * @throws {Error} when the wallet is disconnected, the chain/account changed,
 *   the wallet rejects, the returned hash is malformed, or the receipt confirms
 *   a revert.
 * @throws {UnknownTransactionOutcomeError} when the outcome cannot be confirmed.
 */
export async function submitTransaction(
  input: SubmitTransactionInput,
): Promise<SubmittedTransaction> {
  const { provider, transaction, expectedAccount, verify } = input;

  if (!expectedAccount) {
    throw new Error("Wallet not connected");
  }

  // Pre-submission guard — re-check the chain and selected account immediately
  // before every submission. Never switch either silently. Provider reads are
  // normalized so raw provider text cannot surface.
  const [currentChainId, currentAccounts] = await Promise.all([
    viaProvider(() => getChainId(provider)),
    viaProvider(() => getAccounts(provider)),
  ]);
  const guardFailure = checkWalletForSubmission({
    expectedChainId: transaction.chainId,
    expectedAccount,
    currentAccounts,
    currentChainId,
  });
  if (guardFailure) {
    // Our own guard message — preserved as-is, never normalized.
    throw new Error(walletGuardFailureMessage(guardFailure));
  }

  // Standards-compatible EIP-1193 parameters (no non-standard `chainId`).
  // A rejection/failure here is normalized to a user-safe message.
  const hash = await viaProvider(() =>
    provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: expectedAccount,
          to: transaction.to,
          data: transaction.data,
          value: "0x0",
        },
      ],
    }),
  );

  if (typeof hash !== "string" || !hash.startsWith("0x")) {
    throw new Error("Invalid transaction hash returned");
  }

  const outcome = await verify(hash as `0x${string}`);

  if (!outcome.ok) {
    if (outcome.reason === "TRANSACTION_REVERTED") {
      throw new Error(outcome.message);
    }
    throw new UnknownTransactionOutcomeError(
      `Confirmation unknown — ${outcome.message}`,
      hash as `0x${string}`,
    );
  }

  return {
    transactionHash: outcome.transactionHash,
    blockNumber: outcome.blockNumber,
    logs: outcome.logs,
  };
}
