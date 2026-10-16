import type { ArcNetwork } from "../arc/network";
import { keccak256, encodeAbiParameters } from "viem";

import {
  ARCFLOW_V2_EXECUTE_TYPEHASH,
  computeArcFlowV2DomainSeparator as getArcFlowV2DomainSeparator,
  computeArcFlowV2AuthorizationDigestDirect as hashArcFlowV2Authorization,
  requireArcFlowV2ContractAddress,
  isArcFlowV2AddressConfigured,
} from "./authorization";

/**
 * ArcFlow contract configuration.
 * 
 * The contract address will be populated after deployment to Arc mainnet.
 * Set via NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS environment variable.
 */

const configuredAddress = process.env.NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS?.trim();
const configuredV2Address = process.env.NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS?.trim();

export const ARCFLOW_CONTRACT_ADDRESS = (configuredAddress && configuredAddress.length === 42 
  ? configuredAddress 
  : "0x") as `0x${string}`;

export const ARCFLOW_V2_CONTRACT_ADDRESS = (configuredV2Address && configuredV2Address.length === 42 
  ? configuredV2Address 
  : "0x") as `0x${string}`;

/** ArcFlow contract ABI for frontend interaction. */
export const ARCFLOW_ABI = [
  { type: "error", name: "InvalidRecipient", inputs: [{ name: "recipient", type: "address" }] },
  { type: "error", name: "InvalidThreshold", inputs: [{ name: "threshold", type: "uint256" }] },
  { type: "error", name: "InvalidSplit", inputs: [{ name: "totalBps", type: "uint16" }] },
  { type: "error", name: "IdenticalRecipients", inputs: [{ name: "recipient", type: "address" }] },
  { type: "error", name: "FlowNotFound", inputs: [{ name: "flowId", type: "uint256" }] },
  { type: "error", name: "NotFlowOwner", inputs: [{ name: "caller", type: "address" }, { name: "owner", type: "address" }] },
  { type: "error", name: "FlowInactive", inputs: [{ name: "flowId", type: "uint256" }] },
  { type: "error", name: "AmountBelowThreshold", inputs: [{ name: "amount", type: "uint256" }, { name: "threshold", type: "uint256" }] },
  { type: "error", name: "TransferFailed", inputs: [{ name: "reason", type: "string" }] },
  { type: "error", name: "InsufficientAllowance", inputs: [{ name: "required", type: "uint256" }, { name: "available", type: "uint256" }] },
  { type: "error", name: "InsufficientBalance", inputs: [{ name: "required", type: "uint256" }, { name: "available", type: "uint256" }] },

  { type: "event", name: "FlowCreated", inputs: [
    { name: "flowId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "treasury", type: "address" },
    { name: "contributor", type: "address" },
    { name: "threshold", type: "uint256" },
    { name: "treasuryBps", type: "uint16" },
    { name: "contributorBps", type: "uint16" }
  ] },
  { type: "event", name: "FlowStatusChanged", inputs: [
    { name: "flowId", type: "uint256", indexed: true },
    { name: "active", type: "bool" }
  ] },
  { type: "event", name: "FlowExecuted", inputs: [
    { name: "flowId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "amount", type: "uint256" },
    { name: "treasuryAmount", type: "uint256" },
    { name: "contributorAmount", type: "uint256" }
  ] },

  { type: "function", name: "usdc", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "flows", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [
    { name: "owner", type: "address" },
    { name: "treasury", type: "address" },
    { name: "contributor", type: "address" },
    { name: "treasuryBps", type: "uint16" },
    { name: "contributorBps", type: "uint16" },
    { name: "threshold", type: "uint256" },
    { name: "active", type: "bool" }
  ] },
  { type: "function", name: "getFlow", stateMutability: "view", inputs: [{ name: "flowId", type: "uint256" }], outputs: [
    { name: "owner", type: "address" },
    { name: "treasury", type: "address" },
    { name: "contributor", type: "address" },
    { name: "treasuryBps", type: "uint16" },
    { name: "contributorBps", type: "uint16" },
    { name: "threshold", type: "uint256" },
    { name: "active", type: "bool" }
  ] },
  { type: "function", name: "getFlowCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getFlowsByOwner", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256[]" }] },

  { type: "function", name: "createFlow", stateMutability: "nonpayable", inputs: [
    { name: "treasury", type: "address" },
    { name: "contributor", type: "address" },
    { name: "threshold", type: "uint256" },
    { name: "treasuryBps", type: "uint16" },
    { name: "contributorBps", type: "uint16" }
  ], outputs: [{ name: "flowId", type: "uint256" }] },
  { type: "function", name: "activateFlow", stateMutability: "nonpayable", inputs: [{ name: "flowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "pauseFlow", stateMutability: "nonpayable", inputs: [{ name: "flowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "executeSplit", stateMutability: "nonpayable", inputs: [
    { name: "flowId", type: "uint256" },
    { name: "amount", type: "uint256" }
  ], outputs: [] },
  { type: "function", name: "rescueERC20", stateMutability: "nonpayable", inputs: [
    { name: "token", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" }
  ], outputs: [] }
] as const;

/**
 * Resolve the V1 contract address.
 *
 * RETAINED SINGLE-NETWORK ASSUMPTION (Phase 23.59): the address comes from one
 * env value (`NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS`); the `network` argument is
 * accepted for call-site symmetry but intentionally does not select a different
 * address per chain. Correcting this would require per-network env vars
 * (a configuration change), so it is documented rather than changed. Because
 * the value is unset in every environment we ship, this returns the `"0x"`
 * placeholder and `isArcFlowConfigured()` is `false` — production deployment
 * stays disabled.
 */
export function getArcFlowContractAddress(network: ArcNetwork): `0x${string}` {
  void network; // single-network assumption — see doc comment above
  return ARCFLOW_CONTRACT_ADDRESS as `0x${string}`;
}

export function isArcFlowConfigured(network: ArcNetwork): boolean {
  const address = getArcFlowContractAddress(network);
  return address !== "0x" && address.length === 42;
}

const CONTRACT_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * Resolve the V1 contract address for display, or `null` when it is not a
 * well-formed address (unset placeholder "0x", malformed, or missing env).
 * Callers MUST validate before rendering an explorer link so a placeholder is
 * never presented as a real address.
 */
export function resolveArcFlowContractAddress(network: ArcNetwork): `0x${string}` | null {
  const address = getArcFlowContractAddress(network);
  return CONTRACT_ADDRESS_PATTERN.test(address) ? (address as `0x${string}`) : null;
}

export const ARCFLOW_V2_ABI = [
  { type: "error", name: "InvalidRecipient", inputs: [{ name: "recipient", type: "address" }] },
  { type: "error", name: "InvalidThreshold", inputs: [{ name: "threshold", type: "uint256" }] },
  { type: "error", name: "InvalidSplit", inputs: [{ name: "totalBps", type: "uint16" }] },
  { type: "error", name: "IdenticalRecipients", inputs: [{ name: "recipient", type: "address" }] },
  { type: "error", name: "FlowNotFound", inputs: [{ name: "flowId", type: "uint256" }] },
  { type: "error", name: "NotFlowOwner", inputs: [{ name: "caller", type: "address" }, { name: "owner", type: "address" }] },
  { type: "error", name: "FlowInactive", inputs: [{ name: "flowId", type: "uint256" }] },
  { type: "error", name: "AmountBelowThreshold", inputs: [{ name: "amount", type: "uint256" }, { name: "threshold", type: "uint256" }] },
  { type: "error", name: "TransferFailed", inputs: [{ name: "reason", type: "string" }] },
  { type: "error", name: "InsufficientAllowance", inputs: [{ name: "required", type: "uint256" }, { name: "available", type: "uint256" }] },
  { type: "error", name: "InsufficientBalance", inputs: [{ name: "required", type: "uint256" }, { name: "available", type: "uint256" }] },
  { type: "error", name: "AuthorizationExpired", inputs: [] },
  { type: "error", name: "AuthorizationNotYetValid", inputs: [] },
  { type: "error", name: "InvalidAuthorization", inputs: [{ name: "reason", type: "string" }] },

  { type: "event", name: "FlowCreated", inputs: [
    { name: "flowId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "treasury", type: "address" },
    { name: "contributor", type: "address" },
    { name: "threshold", type: "uint256" },
    { name: "treasuryBps", type: "uint16" },
    { name: "contributorBps", type: "uint16" }
  ] },
  { type: "event", name: "FlowStatusChanged", inputs: [
    { name: "flowId", type: "uint256", indexed: true },
    { name: "active", type: "bool" }
  ] },
  { type: "event", name: "AutoExecuteToggled", inputs: [
    { name: "flowId", type: "uint256", indexed: true },
    { name: "enabled", type: "bool" }
  ] },
  { type: "event", name: "FlowExecuted", inputs: [
    { name: "flowId", type: "uint256", indexed: true },
    { name: "owner", type: "address", indexed: true },
    { name: "amount", type: "uint256" },
    { name: "treasuryAmount", type: "uint256" },
    { name: "contributorAmount", type: "uint256" }
  ] },

  { type: "function", name: "usdc", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "flows", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [
    { name: "owner", type: "address" },
    { name: "treasury", type: "address" },
    { name: "contributor", type: "address" },
    { name: "treasuryBps", type: "uint16" },
    { name: "contributorBps", type: "uint16" },
    { name: "threshold", type: "uint256" },
    { name: "active", type: "bool" },
    { name: "autoExecute", type: "bool" }
  ] },
  { type: "function", name: "getFlow", stateMutability: "view", inputs: [{ name: "flowId", type: "uint256" }], outputs: [
    { name: "owner", type: "address" },
    { name: "treasury", type: "address" },
    { name: "contributor", type: "address" },
    { name: "treasuryBps", type: "uint16" },
    { name: "contributorBps", type: "uint16" },
    { name: "threshold", type: "uint256" },
    { name: "active", type: "bool" },
    { name: "autoExecute", type: "bool" }
  ] },
  { type: "function", name: "getFlowCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getFlowsByOwner", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256[]" }] },

  { type: "function", name: "createFlow", stateMutability: "nonpayable", inputs: [
    { name: "treasury", type: "address" },
    { name: "contributor", type: "address" },
    { name: "threshold", type: "uint256" },
    { name: "treasuryBps", type: "uint16" },
    { name: "contributorBps", type: "uint16" }
  ], outputs: [{ name: "flowId", type: "uint256" }] },
  { type: "function", name: "activateFlow", stateMutability: "nonpayable", inputs: [{ name: "flowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "pauseFlow", stateMutability: "nonpayable", inputs: [{ name: "flowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "toggleAutoExecute", stateMutability: "nonpayable", inputs: [{ name: "flowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "executeSplitWithDualAuth", stateMutability: "nonpayable", inputs: [
    { name: "flowId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "flowValidAfter", type: "uint256" },
    { name: "flowValidBefore", type: "uint256" },
    { name: "flowNonce", type: "bytes32" },
    { name: "flowV", type: "uint8" },
    { name: "flowR", type: "bytes32" },
    { name: "flowS", type: "bytes32" },
    { name: "usdcValidAfter", type: "uint256" },
    { name: "usdcValidBefore", type: "uint256" },
    { name: "usdcNonce", type: "bytes32" },
    { name: "usdcV", type: "uint8" },
    { name: "usdcR", type: "bytes32" },
    { name: "usdcS", type: "bytes32" }
  ], outputs: [] },
  { type: "function", name: "activateFlow", stateMutability: "nonpayable", inputs: [{ name: "flowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "pauseFlow", stateMutability: "nonpayable", inputs: [{ name: "flowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "toggleAutoExecute", stateMutability: "nonpayable", inputs: [{ name: "flowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "executeSplit", stateMutability: "nonpayable", inputs: [
    { name: "flowId", type: "uint256" },
    { name: "amount", type: "uint256" }
  ], outputs: [] },
  { type: "function", name: "rescueERC20", stateMutability: "nonpayable", inputs: [
    { name: "token", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" }
  ], outputs: [] }
] as const;

/**
 * Resolve the ArcFlow V2 contract address (fail closed, Phase 21.3).
 * Delegates to the single canonical resolver in authorization-types.ts,
 * which rejects missing, malformed, zero-address, and deprecated-predecessor
 * values before they can be used as a verifying contract or call target.
 * (The previous local copy silently returned the "0x" placeholder.)
 */
export function getArcFlowV2ContractAddress(network: ArcNetwork): `0x${string}` {
  void network; // address comes from configuration, not the network profile
  return requireArcFlowV2ContractAddress();
}

export function isArcFlowV2Configured(network: ArcNetwork): boolean {
  void network;
  return isArcFlowV2AddressConfigured();
}

/** Re-export canonical functions from authorization module */
export { computeArcFlowV2DomainSeparator as getArcFlowV2DomainSeparator, ARCFLOW_V2_EXECUTE_TYPEHASH, computeArcFlowV2AuthorizationDigestDirect as hashArcFlowV2Authorization } from "./authorization";