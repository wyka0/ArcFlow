import { decodeEventLog, isAddress, type Address, type Hex } from "viem";

import { ARC_ABI_PAYMENT_RECEIPT } from "@/lib/arc/usdc";
import { isTransactionHash, toUsdcBaseUnits } from "@/lib/arc/payment";
import type { ArcNetwork } from "@/lib/arc/network";
import type { EvmAddress, TokenAmount, TransactionHash } from "@/types";

/**
 * Pure USDC transfer verification.
 *
 * This module performs NO network access, so every rule is a deterministic unit
 * test. The caller supplies a receipt (and, when the receipt carries no chainId,
 * the chain id it observed). Nothing here may trust client-supplied metadata:
 * the expected payment is a server-side intent, and the actual values are read
 * from the receipt.
 */

export interface ExpectedUsdcPayment {
  chainId: number;
  tokenAddress: EvmAddress;
  recipient: EvmAddress;
  amount: TokenAmount;
  /** Optional: the intent's sender, validated when known. */
  sender?: EvmAddress | null;
}

export interface ReceiptLog {
  address: string;
  topics: readonly string[];
  data: string;
}

export interface MinimalReceipt {
  status: "success" | "reverted";
  transactionHash: string;
  blockNumber: bigint;
  from?: string;
  to?: string | null;
  chainId?: number;
  logs: readonly ReceiptLog[];
}

export type VerificationFailureReason =
  | "MALFORMED_HASH"
  | "RECEIPT_NOT_FOUND"
  | "WRONG_CHAIN"
  | "RECEIPT_FAILED"
  | "NO_USDC_TRANSFER";

export type VerificationFailure =
  | { ok: false; reason: VerificationFailureReason; message: string }
  | {
      ok: false;
      reason: "TRANSFER_MISMATCH";
      field: "token" | "recipient" | "amount" | "sender";
      message: string;
    };

export interface VerifiedTransfer {
  ok: true;
  transactionHash: TransactionHash;
  chainId: number;
  tokenAddress: EvmAddress;
  sender: EvmAddress;
  recipient: EvmAddress;
  amount: TokenAmount;
  amountBaseUnits: string;
  blockNumber: bigint;
}

export type VerificationResult = VerifiedTransfer | VerificationFailure;

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Decodes every ERC-20 Transfer event emitted by the expected USDC contract.
 * Logs from any other contract are ignored — an unrelated token cannot satisfy
 * the check even if it emits a matching Transfer shape.
 */
export function decodeUsdcTransfers(
  logs: readonly ReceiptLog[],
  tokenAddress: EvmAddress,
): Array<{ from: EvmAddress; to: EvmAddress; value: bigint }> {
  const transfers: Array<{ from: EvmAddress; to: EvmAddress; value: bigint }> = [];

  for (const log of logs) {
    if (!sameAddress(log.address, tokenAddress)) continue;
    try {
      const decoded = decodeEventLog({
        abi: ARC_ABI_PAYMENT_RECEIPT,
        eventName: "Transfer",
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data as Hex,
      });

      const args = decoded.args as unknown as { from: string; to: string; value: bigint };
      if (
        typeof args?.from !== "string" ||
        typeof args?.to !== "string" ||
        typeof args?.value !== "bigint"
      ) {
        continue;
      }
      transfers.push({
        from: args.from as EvmAddress,
        to: args.to as EvmAddress,
        value: args.value,
      });
    } catch {
      // Not a Transfer event on this contract — skip.
    }
  }

  return transfers;
}

function failure(reason: VerificationFailureReason, message: string): VerificationFailure {
  return { ok: false, reason, message };
}

function mismatch(
  field: "token" | "recipient" | "amount" | "sender",
  message: string,
): VerificationFailure {
  return { ok: false, reason: "TRANSFER_MISMATCH", field, message };
}

/**
 * Verify a receipt against a server-side expected payment.
 *
 * Ordering is deliberate: hash → chain → existence → success → token/event →
 * recipient → amount → sender. Nothing after the first failure runs.
 */
export function verifyUsdcPayment(input: {
  transactionHash: string;
  network: ArcNetwork;
  expected: ExpectedUsdcPayment;
  receipt: MinimalReceipt | null;
  observedChainId?: number | null;
}): VerificationResult {
  const { transactionHash, network, expected, receipt, observedChainId } = input;

  if (!isTransactionHash(transactionHash)) {
    return failure("MALFORMED_HASH", "The transaction hash is not a valid 32-byte hash.");
  }

  const receiptChainId = receipt?.chainId ?? observedChainId ?? null;
  if (receiptChainId === null || receiptChainId !== network.chainId) {
    return failure("WRONG_CHAIN", `The transaction is not on ${network.label}.`);
  }

  if (expected.chainId !== network.chainId) {
    return failure("WRONG_CHAIN", "The expected payment was not created for this Arc network.");
  }

  if (!receipt) {
    return failure("RECEIPT_NOT_FOUND", "No Arc receipt exists for this transaction hash.");
  }

  if (receipt.status !== "success") {
    return failure("RECEIPT_FAILED", "The Arc transaction was mined but reverted.");
  }

  const transfers = decodeUsdcTransfers(receipt.logs, expected.tokenAddress);
  if (transfers.length === 0) {
    return failure(
      "NO_USDC_TRANSFER",
      "The transaction contains no Transfer event from the configured USDC contract.",
    );
  }

  const expectedBaseUnits = toUsdcBaseUnits(expected.amount.amount);
  const expectedRecipient = expected.recipient;
  const expectedSender = expected.sender ?? null;

  // Select the transfer that matches what was expected, rather than accepting
  // any transfer that merely happens to exist in the transaction.
  const matching = transfers.find((transfer) => {
    if (!sameAddress(transfer.to, expectedRecipient)) return false;
    if (transfer.value !== expectedBaseUnits) return false;
    if (expectedSender && !sameAddress(transfer.from, expectedSender)) return false;
    return true;
  });

  if (!matching) {
    // Distinguish token/recipient/amount/sender for a useful, safe error.
    const recipientMatches = transfers.filter((t) => sameAddress(t.to, expectedRecipient));
    if (recipientMatches.length === 0) {
      return mismatch("recipient", "The USDC transfer recipient does not match the expected recipient.");
    }

    const amountMatches = recipientMatches.filter((t) => t.value === expectedBaseUnits);
    if (amountMatches.length === 0) {
      return mismatch(
        "amount",
        "The USDC transfer amount does not exactly match the expected amount.",
      );
    }

    const senderMatches = amountMatches.filter(
      (t) => !expectedSender || sameAddress(t.from, expectedSender),
    );
    if (senderMatches.length === 0) {
      return mismatch("sender", "The USDC transfer sender does not match the expected sender.");
    }

    return mismatch("recipient", "No USDC transfer matched the expected payment.");
  }

  return {
    ok: true,
    transactionHash,
    chainId: receiptChainId,
    tokenAddress: expected.tokenAddress,
    sender: matching.from,
    recipient: matching.to,
    amount: expected.amount,
    amountBaseUnits: expectedBaseUnits.toString(),
    blockNumber: receipt.blockNumber,
  };
}

export function isEvmAddress(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value, { strict: false });
}
