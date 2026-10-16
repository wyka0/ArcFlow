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

// ============================================================
// Phase 48.1 — deployment safety helpers
// ============================================================

/** The four wizard phases that map to on-chain transactions, in order. */
export type DeployStepKey = Exclude<DeployPhase, "complete">;

/** A submitted transaction whose on-chain outcome could not be confirmed. */
export interface UnresolvedDeployment {
  transactionHash: `0x${string}`;
  /** The phase during which the outcome became unknown. */
  phase: DeployStepKey;
}

/**
 * The four-transaction disclosure rendered on the review screen, in execution
 * order. Kept as a constant so the copy is unit-testable and cannot drift
 * between the review UI and the orchestrator's documented sequence.
 */
export const DEPLOYMENT_DISCLOSURE_STEPS = [
  "Create the flow",
  "Activate the flow",
  "Approve the exact USDC amount",
  "Execute the split",
] as const;

/**
 * Copy stating that execution spends exactly the threshold amount entered, and
 * that nothing runs automatically (Phase 48 audit finding: the threshold is the
 * execution amount, not just a minimum).
 */
export const EXECUTION_AMOUNT_DISCLOSURE =
  "The split executes for exactly the threshold amount entered above. ArcFlow does not monitor payments and never executes automatically — every run is started manually.";

/**
 * Synchronous single-flight + reconciliation gate for starting a deployment.
 *
 * Pure so the guard rules are unit-testable and cannot drift from the UI
 * wiring. It must be evaluated **before any await** so a double-click cannot
 * start a second journey, and re-checked on every attempt so an unresolved
 * unknown outcome (timeout / RPC failure) blocks a blind restart of the same
 * deployment journey until the outcome is reconciled on the explorer or the
 * user explicitly acknowledges the risk.
 */
export function canBeginDeployment(state: {
  inFlight: boolean;
  unresolvedUnknown: UnresolvedDeployment | null;
}): { ok: true } | { ok: false; reason: "in-flight" | "unresolved-unknown" } {
  if (state.inFlight) {
    return { ok: false, reason: "in-flight" };
  }
  if (state.unresolvedUnknown) {
    return { ok: false, reason: "unresolved-unknown" };
  }
  return { ok: true };
}

/**
 * Merge an observational progress patch into the accumulated deployment state.
 *
 * Pure and additive: a patch never removes previously observed evidence (tx
 * hashes, flow id), so when a later step fails the UI can still show every
 * step that completed. The deployment screen uses this for its state updates
 * so the partial-completion semantics cannot drift from the unit tests.
 */
export function applyDeploymentProgress<S extends { phase: string }>(
  prev: S,
  patch: Partial<S> & { phase: S["phase"] },
): S {
  return { ...prev, ...patch };
}
