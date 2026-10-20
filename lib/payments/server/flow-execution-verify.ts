import { decodeEventLog, type Hex } from "viem";

import type { ArcNetwork } from "@/lib/arc/network";
import { isTransactionHash } from "@/lib/arc/payment";
import { ARCFLOW_ABI } from "@/lib/arcflow/contract";
import type { EvmAddress } from "@/types";

import { decodeUsdcTransfers, type MinimalReceipt, type ReceiptLog } from "./verify";

/**
 * Pure verification for ArcFlow `executeSplit` transactions.
 *
 * Like `verify.ts`, this module performs NO network access, so every rule is a
 * deterministic unit test. The expected flow configuration is read from the
 * contract by the caller and passed in; the actual values are decoded from the
 * receipt. Client-supplied amounts, recipients, and flow ids are never read.
 *
 * V1 contract rules encoded here (verified against `contracts/ArcFlow.sol`):
 *  - `executeSplit` is owner-only: the transaction sender must be the flow owner.
 *  - Exactly one `FlowExecuted(flowId, owner, amount, treasuryAmount,
 *    contributorAmount)` event is emitted by the configured contract.
 *  - Exactly one owner→contract USDC pull of `amount`, followed by
 *    contract→treasury and contract→contributor transfers; a distribution leg
 *    whose amount is zero is skipped by the contract.
 *  - treasuryAmount = floor(amount * treasuryBps / 10000); contributorAmount is
 *    the remainder (no dust is left in the contract).
 *  - The requested hash is canonicalised to lowercase before any comparison,
 *    and the receipt must carry that same transaction (case-insensitive) — a
 *    reader that returns a different transaction's receipt is rejected.
 */

export interface ExpectedFlowExecution {
  flowId: bigint;
  owner: EvmAddress;
  treasury: EvmAddress;
  contributor: EvmAddress;
  treasuryBps: number;
  contributorBps: number;
}

export interface DecodedFlowExecuted {
  flowId: bigint;
  owner: EvmAddress;
  amountBaseUnits: bigint;
  treasuryAmountBaseUnits: bigint;
  contributorAmountBaseUnits: bigint;
}

export type FlowExecutionFailureReason =
  | "MALFORMED_HASH"
  | "WRONG_CHAIN"
  | "RECEIPT_NOT_FOUND"
  | "RECEIPT_HASH_MISMATCH"
  | "RECEIPT_FAILED"
  | "WRONG_CONTRACT"
  | "NOT_FLOW_EXECUTION"
  | "FLOW_MISMATCH"
  | "OWNER_MISMATCH"
  | "SPLIT_MISMATCH"
  | "TRANSFER_MISMATCH";

export interface FlowExecutionFailure {
  ok: false;
  reason: FlowExecutionFailureReason;
  message: string;
}

export interface VerifiedFlowExecution {
  ok: true;
  transactionHash: `0x${string}`;
  chainId: number;
  blockNumber: bigint;
  flowId: bigint;
  owner: EvmAddress;
  amountBaseUnits: bigint;
  treasuryAmountBaseUnits: bigint;
  contributorAmountBaseUnits: bigint;
}

export type FlowExecutionVerificationResult = VerifiedFlowExecution | FlowExecutionFailure;

const BASIS_POINTS_DENOMINATOR = 10_000n;

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function failure(reason: FlowExecutionFailureReason, message: string): FlowExecutionFailure {
  return { ok: false, reason, message };
}

/**
 * Decode every `FlowExecuted` event emitted by `contractAddress`.
 *
 * Logs from any other contract are ignored, and undecodable logs are skipped:
 * an unrelated contract cannot satisfy the check even with a matching shape.
 */
function decodeFlowExecutedMatches(
  logs: readonly ReceiptLog[],
  contractAddress: string,
): DecodedFlowExecuted[] {
  const matches: DecodedFlowExecuted[] = [];

  for (const log of logs) {
    if (!sameAddress(log.address, contractAddress)) continue;
    try {
      const decoded = decodeEventLog({
        abi: ARCFLOW_ABI,
        eventName: "FlowExecuted",
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data as Hex,
      });

      const args = decoded.args as unknown as {
        flowId?: unknown;
        owner?: unknown;
        amount?: unknown;
        treasuryAmount?: unknown;
        contributorAmount?: unknown;
      };
      if (
        typeof args?.flowId !== "bigint" ||
        typeof args?.owner !== "string" ||
        typeof args?.amount !== "bigint" ||
        typeof args?.treasuryAmount !== "bigint" ||
        typeof args?.contributorAmount !== "bigint"
      ) {
        continue;
      }

      matches.push({
        flowId: args.flowId,
        owner: args.owner as EvmAddress,
        amountBaseUnits: args.amount,
        treasuryAmountBaseUnits: args.treasuryAmount,
        contributorAmountBaseUnits: args.contributorAmount,
      });
    } catch {
      // Not a FlowExecuted log — keep scanning the remaining logs.
    }
  }

  return matches;
}

/**
 * Decode the single `FlowExecuted` event emitted by `contractAddress`, or
 * `null` when there is none or more than one. Callers MUST treat `null` as a
 * hard failure — the flow id is never guessed.
 */
export function decodeFlowExecuted(
  logs: readonly ReceiptLog[],
  contractAddress: string,
): DecodedFlowExecuted | null {
  const matches = decodeFlowExecutedMatches(logs, contractAddress);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Verify a receipt against the authoritative on-chain flow configuration.
 *
 * Ordering is deliberate: hash → canonicalisation → chain → existence →
 * receipt binding → success → contract → sender → event (exactly one) →
 * flow id → owners → split arithmetic → exact USDC transfer set. Nothing
 * after the first failure runs.
 */
export function verifyFlowExecutionReceipt(input: {
  transactionHash: string;
  network: ArcNetwork;
  contractAddress: string;
  expected: ExpectedFlowExecution;
  receipt: MinimalReceipt | null;
  observedChainId?: number | null;
}): FlowExecutionVerificationResult {
  const { network, contractAddress, expected, receipt, observedChainId } = input;

  if (!isTransactionHash(input.transactionHash)) {
    return failure("MALFORMED_HASH", "The transaction hash is not a valid 32-byte hash.");
  }

  // Canonicalise once: every comparison below — and the hash returned for
  // persistence — uses the lowercase form, so a case-variant resubmission of
  // the same transaction can never produce a second record.
  const transactionHash = input.transactionHash.toLowerCase() as `0x${string}`;

  const receiptChainId = receipt?.chainId ?? observedChainId ?? null;
  if (receiptChainId === null || receiptChainId !== network.chainId) {
    return failure("WRONG_CHAIN", `The transaction is not on ${network.label}.`);
  }

  if (!receipt) {
    return failure("RECEIPT_NOT_FOUND", "No Arc receipt exists for this transaction hash.");
  }

  // Bind the receipt to the requested transaction: a reader that returns a
  // receipt for a different transaction must never reach persistence.
  if (receipt.transactionHash.toLowerCase() !== transactionHash) {
    return failure(
      "RECEIPT_HASH_MISMATCH",
      "The receipt does not correspond to the requested transaction hash.",
    );
  }

  if (receipt.status !== "success") {
    return failure("RECEIPT_FAILED", "The Arc transaction was mined but reverted.");
  }

  if (!receipt.to || !sameAddress(receipt.to, contractAddress)) {
    return failure(
      "WRONG_CONTRACT",
      "The transaction does not target the configured ArcFlow contract.",
    );
  }

  if (!receipt.from) {
    return failure("OWNER_MISMATCH", "The receipt does not identify the sending account.");
  }

  const matches = decodeFlowExecutedMatches(receipt.logs, contractAddress);
  if (matches.length === 0) {
    return failure(
      "NOT_FLOW_EXECUTION",
      "The transaction contains no FlowExecuted event from the configured ArcFlow contract.",
    );
  }
  if (matches.length > 1) {
    return failure(
      "NOT_FLOW_EXECUTION",
      "The transaction contains multiple FlowExecuted events; exactly one is required.",
    );
  }
  const event = matches[0];

  if (event.flowId !== expected.flowId) {
    return failure("FLOW_MISMATCH", "The executed flow does not match the expected flow.");
  }

  if (!sameAddress(event.owner, expected.owner)) {
    return failure(
      "OWNER_MISMATCH",
      "The executed flow owner does not match the on-chain flow owner.",
    );
  }

  if (!sameAddress(receipt.from, expected.owner)) {
    return failure("OWNER_MISMATCH", "The transaction was not sent by the flow owner.");
  }

  // Split arithmetic — recomputed from the on-chain basis points, matching the
  // contract exactly: treasury = floor(amount * bps / 10000), contributor =
  // remainder.
  const amount = event.amountBaseUnits;
  const treasuryAmount = event.treasuryAmountBaseUnits;
  const contributorAmount = event.contributorAmountBaseUnits;
  const recomputedTreasury = (amount * BigInt(expected.treasuryBps)) / BASIS_POINTS_DENOMINATOR;
  const recomputedContributor = amount - recomputedTreasury;
  if (treasuryAmount !== recomputedTreasury || contributorAmount !== recomputedContributor) {
    return failure(
      "SPLIT_MISMATCH",
      "The executed split does not match the flow's configured basis points.",
    );
  }

  // The exact expected USDC transfer set: one owner→contract pull, plus one
  // distribution leg per non-zero amount (the contract skips zero legs).
  const expectedLegs: Array<{ from: EvmAddress; to: EvmAddress; value: bigint }> = [
    { from: expected.owner, to: contractAddress as EvmAddress, value: amount },
  ];
  if (treasuryAmount > 0n) {
    expectedLegs.push({
      from: contractAddress as EvmAddress,
      to: expected.treasury,
      value: treasuryAmount,
    });
  }
  if (contributorAmount > 0n) {
    expectedLegs.push({
      from: contractAddress as EvmAddress,
      to: expected.contributor,
      value: contributorAmount,
    });
  }

  const transfers = decodeUsdcTransfers(receipt.logs, network.usdcAddress);
  if (transfers.length !== expectedLegs.length) {
    return failure(
      "TRANSFER_MISMATCH",
      "The transaction's USDC transfers do not match the expected split.",
    );
  }

  const used = new Array<boolean>(transfers.length).fill(false);
  for (const leg of expectedLegs) {
    const index = transfers.findIndex(
      (transfer, i) =>
        !used[i] &&
        transfer.value === leg.value &&
        sameAddress(transfer.from, leg.from) &&
        sameAddress(transfer.to, leg.to),
    );
    if (index === -1) {
      return failure(
        "TRANSFER_MISMATCH",
        "The transaction's USDC transfers do not match the expected split.",
      );
    }
    used[index] = true;
  }

  return {
    ok: true,
    transactionHash,
    chainId: receiptChainId,
    blockNumber: receipt.blockNumber,
    flowId: event.flowId,
    owner: event.owner,
    amountBaseUnits: amount,
    treasuryAmountBaseUnits: treasuryAmount,
    contributorAmountBaseUnits: contributorAmount,
  };
}
