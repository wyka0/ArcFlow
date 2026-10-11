import { encodeFunctionData, type Address, type Hex, type TypedDataDomain } from "viem";

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
  const usdcAddress = getActiveArcNetwork().usdcAddress;
  return {
    to: usdcAddress,
    data: encodeFunctionData({
      abi: USDC_ABI,
      functionName: "approve",
      args: [getArcFlowContractAddress(network), parseUsdcAmount(amount)],
    }),
  };
}

/** Read a single flow from the contract. */
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

/** Read flows by owner from the contract. */
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

/** Read flow count from the contract. */
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

