import { encodeFunctionData, decodeEventLog, type Address, type Hex, type TypedDataDomain } from "viem";

import { ARCFLOW_ABI, getArcFlowContractAddress, ARCFLOW_V2_ABI, getArcFlowV2ContractAddress } from "./contract";
import { getActiveArcNetwork, type ArcNetwork } from "../arc/network";
import { toUsdcBaseUnits } from "../arc/payment";
import { USDC_ABI } from "../arc/usdc";

import {
  ARCFLOW_V2_EXECUTE_TYPES,
  type DualAuthorizationData,
  type ArcFlowV2ExecuteAuthParams,
  type ArcUSDCEIP3009AuthParams,
  ARCFLOW_V2_EXECUTE_TYPEHASH,
  getArcFlowV2EIP712Domain,
  computeArcFlowV2AuthorizationDigest,
  buildArcFlowV2ExecuteTypedData,
  buildArcFlowV2ExecuteTypedDataMessage,
  buildUSDCTransferWithAuthorizationSignMessage,
  computeUSDCAuthorizationDigest,
  signUSDCAuthorization,
  getUSDCNonce,
  getUSDCDomainSeparator,
} from "./authorization";

/** Flow data as returned by the contract. */
export interface ContractFlow {
  owner: Address;
  treasury: Address;
  contributor: Address;
  treasuryBps: number;
  contributorBps: number;
  threshold: bigint;
  active: boolean;
}

/** Create flow parameters. */
export interface CreateFlowParams {
  treasury: Address;
  contributor: Address;
  threshold: string; // USDC amount as string (e.g., "10.00")
  treasuryBps: number;
  contributorBps: number;
}

/** Execute split parameters. */
export interface ExecuteSplitParams {
  flowId: bigint;
  amount: string; // USDC amount as string (e.g., "10.00")
}

/** Convert USDC amount string to base units (6 decimals). */
export function parseUsdcAmount(amount: string): bigint {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("Invalid USDC amount");
  }
  return toUsdcBaseUnits(num);
}

/**
 * Convert a human split percentage (0–100) into contract basis points (0–10000).
 *
 * The flow builder stores each action's allocation as a percentage where
 * `80` means 80%. The V1 `createFlow` ABI expects basis points whose sum must
 * equal 10000, so `80` must become `8000`.
 *
 * This is the single conversion point — apply it exactly once, at the boundary
 * between the wizard's `Flow` and the contract call. To make double conversion
 * impossible, any value outside 0–100 (for example an already-converted `8000`)
 * is rejected rather than multiplied again.
 */
export function percentToBasisPoints(percent: number): number {
  if (!Number.isInteger(percent)) {
    throw new Error(`Split percentage must be a whole number (received ${percent}).`);
  }
  if (percent < 0 || percent > 100) {
    throw new Error(
      `Split percentage must be between 0 and 100 (received ${percent}); ` +
        `values such as 8000 are basis points and are rejected to prevent double conversion.`,
    );
  }
  return percent * 100;
}

/** Encode createFlow transaction data. */
export function encodeCreateFlow(params: CreateFlowParams, network: ArcNetwork = getActiveArcNetwork()): { to: Address; data: Hex } {
  const contractAddress = getArcFlowContractAddress(network);
  if (contractAddress === "0x") {
    throw new Error("ArcFlow contract not configured");
  }

  return {
    to: contractAddress,
    data: encodeFunctionData({
      abi: ARCFLOW_ABI,
      functionName: "createFlow",
      args: [
        params.treasury,
        params.contributor,
        parseUsdcAmount(params.threshold),
        params.treasuryBps,
        params.contributorBps,
      ],
    }),
  };
}

/** Encode activateFlow transaction data. */
export function encodeActivateFlow(flowId: bigint, network: ArcNetwork = getActiveArcNetwork()): { to: Address; data: Hex } {
  const contractAddress = getArcFlowContractAddress(network);
  if (contractAddress === "0x") {
    throw new Error("ArcFlow contract not configured");
  }

  return {
    to: contractAddress,
    data: encodeFunctionData({
      abi: ARCFLOW_ABI,
      functionName: "activateFlow",
      args: [flowId],
    }),
  };
}

/** Encode pauseFlow transaction data. */
export function encodePauseFlow(flowId: bigint, network: ArcNetwork = getActiveArcNetwork()): { to: Address; data: Hex } {
  const contractAddress = getArcFlowContractAddress(network);
  if (contractAddress === "0x") {
    throw new Error("ArcFlow contract not configured");
  }

  return {
    to: contractAddress,
    data: encodeFunctionData({
      abi: ARCFLOW_ABI,
      functionName: "pauseFlow",
      args: [flowId],
    }),
  };
}

/** Encode executeSplit transaction data. */
export function encodeExecuteSplit(params: ExecuteSplitParams, network: ArcNetwork = getActiveArcNetwork()): { to: Address; data: Hex } {
  const contractAddress = getArcFlowContractAddress(network);
  if (contractAddress === "0x") {
    throw new Error("ArcFlow contract not configured");
  }

  return {
    to: contractAddress,
    data: encodeFunctionData({
      abi: ARCFLOW_ABI,
      functionName: "executeSplit",
      args: [
        params.flowId,
        parseUsdcAmount(params.amount),
      ],
    }),
  };
}

/** Encode approve USDC for ArcFlow transaction data. */
export function encodeApproveUsdcForArcFlow(amount: string, network: ArcNetwork = getActiveArcNetwork()): { to: Address; data: Hex } {
  // Resolve BOTH the token and the spender from the SAME network argument so a
  // multi-network setup can never approve one token to another chain's contract.
  const usdcAddress = network.usdcAddress;
  return {
    to: usdcAddress,
    data: encodeFunctionData({
      abi: USDC_ABI,
      functionName: "approve",
      args: [getArcFlowContractAddress(network), parseUsdcAmount(amount)],
    }),
  };
}

/**
 * Read a single flow from the contract.
 *
 * NOT IMPLEMENTED — stub. Always returns `null`; no on-chain read is performed.
 * Do not treat this as a working flow query.
 */
export async function readFlow(
  flowId: bigint,
  network: ArcNetwork = getActiveArcNetwork()
): Promise<ContractFlow | null> {
  const contractAddress = getArcFlowContractAddress(network);
  if (contractAddress === "0x") {
    throw new Error("ArcFlow contract not configured");
  }

  return null;
}

/**
 * Extract the `flowId` of a newly created flow from the confirmed `createFlow`
 * transaction's receipt logs by decoding the `FlowCreated` event.
 *
 * Returns `null` when the event is absent or unreadable (wrong contract, a
 * reverted call, or a receipt without logs). Callers MUST treat `null` as a
 * hard failure and stop — a flow id is never guessed.
 */
export function extractCreatedFlowId(
  logs: readonly { address: string; topics: readonly string[]; data: string }[],
  network: ArcNetwork = getActiveArcNetwork()
): bigint | null {
  const contractAddress = getArcFlowContractAddress(network);
  if (contractAddress === "0x") return null;
  const expected = contractAddress.toLowerCase();

  for (const log of logs) {
    if (log.address.toLowerCase() !== expected) continue;
    try {
      const decoded = decodeEventLog({
        abi: ARCFLOW_ABI,
        eventName: "FlowCreated",
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      const flowId = (decoded.args as { flowId?: unknown }).flowId;
      if (typeof flowId === "bigint") return flowId;
    } catch {
      // Not a FlowCreated log — keep scanning the remaining logs.
    }
  }

  return null;
}

/**
 * Read flows by owner from the contract.
 *
 * NOT IMPLEMENTED — stub. Always returns `[]`; no on-chain read is performed.
 * The UI does not list flows from chain state.
 */
export async function readFlowsByOwner(
  owner: Address,
  network: ArcNetwork = getActiveArcNetwork()
): Promise<bigint[]> {
  const contractAddress = getArcFlowContractAddress(network);
  if (contractAddress === "0x") {
    throw new Error("ArcFlow contract not configured");
  }

  return [];
}

/**
 * Read flow count from the contract.
 *
 * NOT IMPLEMENTED — stub. Always returns `0n`; no on-chain read is performed.
 */
export async function readFlowCount(
  network: ArcNetwork = getActiveArcNetwork()
): Promise<bigint> {
  const contractAddress = getArcFlowContractAddress(network);
  if (contractAddress === "0x") {
    throw new Error("ArcFlow contract not configured");
  }

  return 0n;
}

/** Format a contract flow for display. */
export function formatContractFlow(flow: ContractFlow, flowId: bigint): {
  id: bigint;
  owner: Address;
  treasury: Address;
  contributor: Address;
  threshold: string;
  treasuryBps: number;
  contributorBps: number;
  active: boolean;
} {
  return {
    id: flowId,
    owner: flow.owner,
    treasury: flow.treasury,
    contributor: flow.contributor,
    threshold: (Number(flow.threshold) / 1_000_000).toFixed(2),
    treasuryBps: flow.treasuryBps,
    contributorBps: flow.contributorBps,
    active: flow.active,
  };
}

/** Format USDC base units for display. */
export function formatUsdcBaseUnits(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = amount % 1_000_000n;
  return `${whole}.${fraction.toString().padStart(6, "0")}`;
}

/** ============================================================
 * ARCFLOW V2 - Dual Signature (EIP-712 + EIP-3009) Interactions
 * ============================================================ */

// Re-export canonical types and functions from authorization module
export {
  ARCFLOW_V2_EXECUTE_TYPES,
  type DualAuthorizationData,
  type ArcFlowV2ExecuteAuthParams,
  type ArcUSDCEIP3009AuthParams,
  ARCFLOW_V2_EXECUTE_TYPEHASH,
  getArcFlowV2EIP712Domain,
  computeArcFlowV2AuthorizationDigest,
  buildArcFlowV2ExecuteTypedData,
  buildArcFlowV2ExecuteTypedDataMessage,
  buildUSDCTransferWithAuthorizationSignMessage,
  computeUSDCAuthorizationDigest,
  signUSDCAuthorization,
  getUSDCNonce,
  getUSDCDomainSeparator,
} from "./authorization";

/** ============================================================
 * ARCFLOW V2 - Transaction Encoding
 * ============================================================ */

/** Encode ArcFlow V2 executeSplitWithDualAuth transaction data */
export function encodeExecuteSplitWithDualAuth(
  params: {
    flowId: bigint;
    amount: bigint;
    // ArcFlow EIP-712 signature
    flowV: number;
    flowR: `0x${string}`;
    flowS: `0x${string}`;
    // USDC EIP-3009 signature
    usdcValidAfter: bigint;
    usdcValidBefore: bigint;
    usdcNonce: `0x${string}`;
    usdcV: number;
    usdcR: `0x${string}`;
    usdcS: `0x${string}`;
    // Common params
    flowValidAfter: bigint;
    flowValidBefore: bigint;
    flowNonce: `0x${string}`;
  },
  network: ArcNetwork = getActiveArcNetwork()
): { to: Address; data: Hex } {
  // Fail-closed resolver: throws when the V2 address is unset/malformed.
  const contractAddress = getArcFlowV2ContractAddress(network);
  return {
    to: contractAddress,
    data: encodeFunctionData({
      abi: ARCFLOW_V2_ABI,
      functionName: "executeSplitWithDualAuth",
      args: [
        params.flowId,
        params.amount,
        params.flowValidAfter,
        params.flowValidBefore,
        params.flowNonce,
        // ArcFlow EIP-712 signature
        params.flowV,
        params.flowR,
        params.flowS,
        // USDC EIP-3009
        params.usdcValidAfter,
        params.usdcValidBefore,
        params.usdcNonce,
        params.usdcV,
        params.usdcR,
        params.usdcS,
      ],
    }),
  };
}

/** Prepare execute split with dual auth transaction */
export function prepareExecuteSplitWithDualAuthTx(
  params: {
    flowId: bigint;
    amount: bigint;
    flowV: number;
    flowR: `0x${string}`;
    flowS: `0x${string}`;
    usdcValidAfter: bigint;
    usdcValidBefore: bigint;
    usdcNonce: `0x${string}`;
    usdcV: number;
    usdcR: `0x${string}`;
    usdcS: `0x${string}`;
    flowValidAfter: bigint;
    flowValidBefore: bigint;
    flowNonce: `0x${string}`;
  },
  network: ArcNetwork = getActiveArcNetwork()
): { to: Address; data: Hex; value: bigint; chainId: number; description: string } {
  const encoded = encodeExecuteSplitWithDualAuth(params, network);
  return {
    to: encoded.to,
    data: encoded.data,
    value: 0n,
    chainId: network.chainId,
    description: `Execute Flow #${params.flowId}: Split ${formatUsdcBaseUnits(params.amount)} USDC (dual auth)`,
  };
}

// Re-export PreparedTransaction type
export type { PreparedTransaction } from "./authorization";

/** Prepare create flow transaction */
export function prepareCreateFlowTx(
  params: CreateFlowParams,
  network: ArcNetwork = getActiveArcNetwork()
): { to: Address; data: Hex; value: bigint; chainId: number; description: string } {
  const encoded = encodeCreateFlow(params, network);
  return {
    to: encoded.to,
    data: encoded.data,
    value: 0n,
    chainId: network.chainId,
    description: `Create Flow: ${params.treasuryBps / 100}% treasury, ${params.contributorBps / 100}% contributor`,
  };
}

/** Prepare approve USDC transaction */
export function prepareApproveUsdcTx(
  amount: string,
  network: ArcNetwork = getActiveArcNetwork()
): { to: Address; data: Hex; value: bigint; chainId: number; description: string } {
  const encoded = encodeApproveUsdcForArcFlow(amount, network);
  return {
    to: encoded.to,
    data: encoded.data,
    value: 0n,
    chainId: network.chainId,
    description: `Approve ${amount} USDC for ArcFlow`,
  };
}

/** Prepare execute split transaction */
export function prepareExecuteSplitTx(
  params: ExecuteSplitParams,
  network: ArcNetwork = getActiveArcNetwork()
): { to: Address; data: Hex; value: bigint; chainId: number; description: string } {
  const encoded = encodeExecuteSplit(params, network);
  return {
    to: encoded.to,
    data: encoded.data,
    value: 0n,
    chainId: network.chainId,
    description: `Execute Flow #${params.flowId}: Split ${params.amount} USDC`,
  };
}

/** Prepare activate flow transaction */
export function prepareActivateFlowTx(
  flowId: bigint,
  network: ArcNetwork = getActiveArcNetwork()
): { to: Address; data: Hex; value: bigint; chainId: number; description: string } {
  const encoded = encodeActivateFlow(flowId, network);
  return {
    to: encoded.to,
    data: encoded.data,
    value: 0n,
    chainId: network.chainId,
    description: `Activate Flow #${flowId}`,
  };
}

