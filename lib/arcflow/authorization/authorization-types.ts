import { keccak256, encodeAbiParameters, toHex } from "viem";
import type { TypedDataDomain } from "viem";

import { getActiveArcNetwork, type ArcNetwork } from "../../arc/network";

/**
 * Arc USDC EIP-3009 Authorization Types
 *
 * Verified on-chain via read-only RPC calls to the proxy at 0x36000000000000000000000000000000000000000.
 * Implementation: 0xC6AD664ac6679F4Ce74e10E91449C93Ec1ae3cA6
 *
 * Domain fields (verified via name() and version() calls on the proxy):
 *   name = "USDC"
 *   version = "2"
 *   chainId = 5042
 *   verifyingContract = 0x36000000000000000000000000000000000000000
 *
 * Typehash: keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
 *   = 0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267
 *
 * The previously used 0x158b0a9edf7a828aad02f63cd515c68ef2f50ba807396f6d12842833a1597429
 * is Circle's CancelAuthorization typehash, NOT TransferWithAuthorization.
 */

// Arc USDC EIP-3009 Domain (verified on-chain)
export const ARC_USDC_EIP3009_DOMAIN = {
  name: "USDC",
  version: "2",
  chainId: 5042,
  verifyingContract: "0x36000000000000000000000000000000000000000" as `0x${string}`,
} as const satisfies TypedDataDomain;

// Standard EIP-3009 TransferWithAuthorization typehash (verified in implementation bytecode)
export const ARC_USDC_EIP3009_TYPEHASH = "0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267" as const;

// Arc USDC EIP-3009 Types
export const ARC_USDC_EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "v", type: "uint8" },
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
  ],
} as const;

// Arc USDC Domain Separator (verified on-chain via DOMAIN_SEPARATOR() call on proxy)
export const ARC_USDC_DOMAIN_SEPARATOR = "0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84" as const;

// ============================================================
// ArcFlow V2 EIP-712 Authorization (separate from USDC)
// ============================================================

export function getArcFlowV2EIP712Domain(network: ArcNetwork): TypedDataDomain {
  return {
    name: "ArcFlow",
    version: "1",
    chainId: network.chainId,
    verifyingContract: getArcFlowV2ContractAddress(network),
  };
}

function getArcFlowV2ContractAddress(network: ArcNetwork): `0x${string}` {
  const configuredV2Address = process.env.NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS?.trim();
  return (configuredV2Address && configuredV2Address.length === 42 
    ? configuredV2Address 
    : "0x") as `0x${string}`;
}

export const ARCFLOW_V2_EXECUTE_TYPES = {
  ExecuteWithAuthorization: [
    { name: "flowId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ArcFlow V2 Execute Typehash
export const ARCFLOW_V2_EXECUTE_TYPEHASH = keccak256(toHex("ExecuteWithAuthorization(uint256 flowId,uint256 amount,uint256 validAfter,uint256 validBefore,bytes32 nonce)"));

// Dual Authorization Data for ArcFlowV2 executeSplitWithDualAuth
export interface DualAuthorizationData {
  // ArcFlow EIP-712 signature
  flowId: bigint;
  amount: bigint;
  flowValidAfter: bigint;
  flowValidBefore: bigint;
  flowNonce: `0x${string}`;
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
}

// USDC EIP-3009 Authorization Params (for building typed data)
export interface ArcUSDCEIP3009AuthParams {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
}

// ArcFlow V2 Execute Authorization Params
export interface ArcFlowV2ExecuteAuthParams {
  flowId: bigint;
  amount: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
}

// Prepared transaction type for UI
export interface PreparedTransaction {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  chainId: number;
  description: string;
}