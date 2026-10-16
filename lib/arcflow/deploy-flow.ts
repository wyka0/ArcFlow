/**
 * Phase 23.52 — ArcFlow V1 deployment orchestration.
 *
 * The single, testable definition of the frontend's
 * `createFlow → activateFlow → approve → executeSplit` sequence for the V1
 * ArcFlow contract. It lives outside the React component so the ordering and
 * the fail-closed stop behaviour can be covered by fast unit tests with no
 * wallet, no RPC, and no network.
 *
 * Sequence rationale — verified against `contracts/ArcFlow.sol`:
 *   1. `createFlow`   — the flow is created with `active: false` (line ~125).
 *   2. `activateFlow` — required: `executeSplit` reverts `FlowInactive`
 *                       while the flow is inactive (line ~172).
 *   3. `approve`      — required: `executeSplit` checks
 *                       `usdc.allowance(flow.owner, address(this))` (line ~176).
 *   4. `executeSplit` — pulls USDC from the owner and splits it 80/20.
 *
 * Every step awaits its confirmed receipt before the next is sent. Any
 * failure or rejection propagates, so no later transaction is ever sent.
 */

import type { Address } from "viem";

import type { Flow } from "@/types/flow";
import type { ArcNetwork } from "../arc/network";
import type { PreparedTransaction } from "./interactions";
import {
  prepareCreateFlowTx,
  prepareActivateFlowTx,
  prepareApproveUsdcTx,
  prepareExecuteSplitTx,
  extractCreatedFlowId,
  percentToBasisPoints,
} from "./interactions";

export type DeployPhase = "create" | "activate" | "approve" | "execute" | "complete";

/** Minimal log shape decoded from a confirmed receipt. */
export interface DeployReceiptLog {
  address: string;
  topics: readonly string[];
  data: string;
}

/** The confirmed result of a single sent transaction. */
export interface DeploySendResult {
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  logs: readonly DeployReceiptLog[];
}

/** Injected sender — the real wallet sender, or a test double. */
export type SendTransaction = (tx: PreparedTransaction) => Promise<DeploySendResult>;

/** Observational progress patch emitted as each step advances. */
export interface DeployFlowProgress {
  phase: DeployPhase;
  flowId?: bigint;
  createTxHash?: `0x${string}`;
  activateTxHash?: `0x${string}`;
  approveTxHash?: `0x${string}`;
  executeTxHash?: `0x${string}`;
}

export interface DeployFlowResult {
  flowId: bigint;
  createTxHash: `0x${string}`;
  activateTxHash: `0x${string}`;
  approveTxHash: `0x${string}`;
  executeTxHash: `0x${string}`;
}

export interface DeployFlowOptions {
  flow: Partial<Flow>;
  network: ArcNetwork;
  sendTransaction: SendTransaction;
  onProgress?: (progress: DeployFlowProgress) => void;
}

/**
 * Execute the full V1 flow deployment.
 *
 * @throws if recipients are missing, the created flow id cannot be decoded
 *   from the confirmed receipt, or any transaction fails/ is rejected.
 */
export async function deployFlow(options: DeployFlowOptions): Promise<DeployFlowResult> {
  const { flow, network, sendTransaction, onProgress } = options;

  const treasury = flow.actions?.[0]?.recipient as Address | undefined;
  const contributor = flow.actions?.[1]?.recipient as Address | undefined;
  if (!treasury || !contributor) {
    throw new Error("Recipient addresses not configured");
  }

  const threshold = flow.condition?.amount || "10.00";

  // The wizard stores percentages (80 = 80%); the V1 ABI takes basis points.
  // Convert exactly once, here, at the boundary.
  const treasuryBps = percentToBasisPoints(flow.actions?.[0]?.percentage ?? 80);
  const contributorBps = percentToBasisPoints(flow.actions?.[1]?.percentage ?? 20);

  // 1. Create the flow (inactive).
  onProgress?.({ phase: "create" });
  const createResult = await sendTransaction(
    prepareCreateFlowTx({ treasury, contributor, threshold, treasuryBps, contributorBps }, network),
  );

  // Resolve the real flow id from the confirmed receipt's FlowCreated event.
  // A missing/unreadable event is a hard stop — the id is never guessed.
  const flowId = extractCreatedFlowId(createResult.logs, network);
  if (flowId === null) {
    throw new Error(
      "Could not determine the created flow id from the confirmed transaction receipt. Stopping before any further transaction.",
    );
  }

  onProgress?.({ phase: "activate", flowId, createTxHash: createResult.transactionHash });

  // 2. Activate the flow (required before execution).
  const activateResult = await sendTransaction(prepareActivateFlowTx(flowId, network));
  onProgress?.({
    phase: "approve",
    flowId,
    createTxHash: createResult.transactionHash,
    activateTxHash: activateResult.transactionHash,
  });

  // 3. Approve USDC spend (required before execution).
  const executeAmount = threshold;
  const approveResult = await sendTransaction(prepareApproveUsdcTx(executeAmount, network));
  onProgress?.({
    phase: "execute",
    flowId,
    createTxHash: createResult.transactionHash,
    activateTxHash: activateResult.transactionHash,
    approveTxHash: approveResult.transactionHash,
  });

  // 4. Execute the split.
  const executeResult = await sendTransaction(
    prepareExecuteSplitTx({ flowId, amount: executeAmount }, network),
  );

  const result: DeployFlowResult = {
    flowId,
    createTxHash: createResult.transactionHash,
    activateTxHash: activateResult.transactionHash,
    approveTxHash: approveResult.transactionHash,
    executeTxHash: executeResult.transactionHash,
  };

  onProgress?.({ phase: "complete", ...result });

  return result;
}
