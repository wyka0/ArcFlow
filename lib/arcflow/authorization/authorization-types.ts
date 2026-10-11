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
// NOTE (Phase 21.3): the verifyingContract previously carried a 41-hex-char
// typo (one zero too many) — corrected to the verified 40-char proxy address.
export const ARC_USDC_EIP3009_DOMAIN = {
  name: "USDC",
  version: "2",
  chainId: 5042,
  verifyingContract: "0x3600000000000000000000000000000000000000" as `0x${string}`,
} as const satisfies TypedDataDomain;

// Standard EIP-3009 TransferWithAuthorization typehash (verified in implementation bytecode)
export const ARC_USDC_EIP3009_TYPEHASH = "0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267" as const;

// NOTE (Phase 21.3): the previously exported ARC_USDC_EIP3009_TYPES constant
// was removed. Its nine-field shape (v, r, s included) mirrored the on-chain
// FUNCTION CALL parameters, not the signed EIP-712 struct; presenting it as
// typed-data types could bind signatures to a struct the contract's six-field
// typehash can never verify. The signed struct is the six fields above.

// Arc USDC Domain Separator (verified on-chain via DOMAIN_SEPARATOR() call on proxy)
export const ARC_USDC_DOMAIN_SEPARATOR = "0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84" as const;

// ============================================================
// ArcFlow V2 EIP-712 Authorization (separate from USDC)
// ============================================================

/**
 * The deprecated, unverified ArcFlowV2 predecessor deployment (broadcast
 * 2026-10-06 from uncommitted working-tree code; bytecode ≠ RC3). It must
 * never be configured or used as a verifying contract.
 */
export const ARCFLOW_V2_FORBIDDEN_PREDECESSOR = "0xf0c80fdd22f8612dd7a877f6da82ab5097d63a66" as const;

const V2_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Canonical fail-closed ArcFlow V2 contract-address resolver (Phase 21.3).
 * Rejects missing, malformed, zero-address, placeholder, and the deprecated
 * predecessor values BEFORE they can be used as an EIP-712 verifying
 * contract. There is no fallback address — ever.
 */
export function requireArcFlowV2ContractAddress(): `0x${string}` {
  const raw = process.env.NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS?.trim();
  if (!raw) {
    throw new Error(
      "ArcFlowV2 contract address is not configured. Set NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS " +
        "to an independently verified deployment before constructing V2 authorizations.",
    );
  }
  if (!V2_ADDRESS_PATTERN.test(raw)) {
    throw new Error(
      "ArcFlowV2 contract address is malformed (expected 0x + 40 hex characters) and therefore not configured. " +
        "Set NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS to an independently verified deployment.",
    );
  }
  const lower = raw.toLowerCase();
  if (lower === ZERO_ADDRESS) {
    throw new Error(
      "ArcFlowV2 contract address is the zero address and therefore not configured. " +
        "Set NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS to an independently verified deployment.",
    );
  }
  if (lower === ARCFLOW_V2_FORBIDDEN_PREDECESSOR) {
    throw new Error(
      "ArcFlowV2 contract address is the deprecated unverified predecessor deployment " +
        "(0xf0c80Fdd…) and must never be configured. Unset NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS " +
        "or set it to the independently verified deployment.",
    );
  }
  return raw as `0x${string}`;
}

/**
 * Non-throwing probe for feature gating / UI state. True only for a
 * well-formed, non-zero, non-predecessor configured address.
 */
export function isArcFlowV2AddressConfigured(): boolean {
  const raw = process.env.NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS?.trim();
  if (!raw) return false;
  if (!V2_ADDRESS_PATTERN.test(raw)) return false;
  const lower = raw.toLowerCase();
  return lower !== ZERO_ADDRESS && lower !== ARCFLOW_V2_FORBIDDEN_PREDECESSOR;
}

export function getArcFlowV2EIP712Domain(network: ArcNetwork): TypedDataDomain {
  return {
    name: "ArcFlow",
    version: "1",
    chainId: network.chainId,
    // Fail closed (Phase 21.3): never a "0x" placeholder verifying contract.
    verifyingContract: requireArcFlowV2ContractAddress(),
  };
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