import { keccak256, encodeAbiParameters, toHex, hexToBytes, concat, recoverAddress } from "viem";
import type { TypedDataDomain, PublicClient, WalletClient } from "viem";

import { getActiveArcNetwork, type ArcNetwork } from "../../arc/network";
import {
  ARC_USDC_EIP3009_DOMAIN,
  ARC_USDC_DOMAIN_SEPARATOR,
  ARC_USDC_EIP3009_TYPEHASH,
} from "./authorization-types";

/**
 * Arc USDC EIP-3009 Authorization Module
 *
 * Handles signing and verification of USDC EIP-3009 transferWithAuthorization
 * using the standard TransferWithAuthorization typehash.
 *
 * Verified on-chain:
 *   - Proxy DOMAIN_SEPARATOR() = 0x940506929bba468048a19b567f4f0d534714bc06604b5c3017e5d16785ccdf84
 *   - Proxy name() = "USDC"
 *   - Proxy version() = "2"
 *   - Implementation bytecode contains TransferWithAuthorization typehash
 */

// USDC EIP-3009 TransferWithAuthorization Types
export const USDC_EIP3009_TRANSFER_TYPES = {
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

/**
 * Build USDC EIP-3009 typed data for transferWithAuthorization
 */
export function buildUSDCTransferWithAuthorizationTypedData(
  params: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  },
  network: ArcNetwork = getActiveArcNetwork()
): { domain: TypedDataDomain; types: typeof USDC_EIP3009_TRANSFER_TYPES; message: Record<string, unknown> } {
  return {
    domain: {
      name: "USDC",
      version: "2",
      chainId: network.chainId,
      verifyingContract: network.usdcAddress,
    },
    types: USDC_EIP3009_TRANSFER_TYPES,
    message: params,
  };
}

/**
 * Build USDC EIP-3009 typed data for signing (without v, r, s)
 * This is what the user signs with their wallet
 */
export function buildUSDCTransferWithAuthorizationSignMessage(
  params: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  },
  network: ArcNetwork = getActiveArcNetwork()
): { domain: TypedDataDomain; types: typeof USDC_EIP3009_TRANSFER_TYPES; message: { from: `0x${string}`; to: `0x${string}`; value: bigint; validAfter: bigint; validBefore: bigint; nonce: `0x${string}` } } {
  return {
    domain: {
      name: "USDC",
      version: "2",
      chainId: 5042,
      verifyingContract: "0x3600000000000000000000000000000000000000",
    },
    types: {
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
    },
    message: {
      from: params.from,
      to: params.to,
      value: params.value,
      validAfter: params.validAfter,
      validBefore: params.validBefore,
      nonce: params.nonce,
    },
  };
}

/**
 * Compute the EIP-712 digest for USDC transferWithAuthorization
 * Uses the verified on-chain domain separator and standard TransferWithAuthorization typehash
 */
export function computeUSDCAuthorizationDigest(
  params: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  }
): `0x${string}` {
  const TYPEHASH = ARC_USDC_EIP3009_TYPEHASH;
  const DOMAIN_SEPARATOR = ARC_USDC_DOMAIN_SEPARATOR;

  // Compute struct hash: keccak256(abi.encode(TYPEHASH, from, to, value, validAfter, validBefore, nonce))
  const structHash = keccak256(encodeAbiParameters(
    [
      { type: "bytes32", name: "typehash" },
      { type: "address", name: "from" },
      { type: "address", name: "to" },
      { type: "uint256", name: "value" },
      { type: "uint256", name: "validAfter" },
      { type: "uint256", name: "validBefore" },
      { type: "bytes32", name: "nonce" },
    ],
    [
      TYPEHASH,
      params.from,
      params.to,
      params.value,
      params.validAfter,
      params.validBefore,
      params.nonce,
    ]
  ));

  // Final digest: keccak256("\x19\x01" || DOMAIN_SEPARATOR || structHash)
  // Use raw bytes concatenation, not encodeAbiParameters
  const prefix = new Uint8Array([0x19, 0x01]);
  const domainBytes = hexToBytes(DOMAIN_SEPARATOR);
  const structBytes = hexToBytes(structHash);
  const digest = keccak256(concat([prefix, domainBytes, structBytes]));

  return digest;
}

/**
 * Sign USDC EIP-3009 authorization with wallet
 * Returns the signature components (v, r, s)
 */
export async function signUSDCAuthorization(
  walletClient: WalletClient,
  account: `0x${string}`,
  params: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  },
  network: ArcNetwork = getActiveArcNetwork()
): Promise<{ v: number; r: `0x${string}`; s: `0x${string}` }> {
  const typedData = buildUSDCTransferWithAuthorizationSignMessage(params, network);

  const signature = await walletClient.signTypedData({
    account,
    domain: typedData.domain,
    types: typedData.types,
    primaryType: "TransferWithAuthorization",
    message: typedData.message,
  });

  // Parse signature into v, r, s
  const sig = signature as `0x${string}`;
  const r = sig.slice(0, 66) as `0x${string}`;
  const s = "0x" + sig.slice(66, 130) as `0x${string}`;
  const v = parseInt(sig.slice(130, 132), 16);

  return { v, r, s };
}

/**
 * Verify that a USDC authorization signature is valid
 * by recovering the signer directly from the EIP-712 digest.
 *
 * IMPORTANT: EIP-712 digests must be recovered with recoverAddress({ hash })
 * — NOT recoverMessageAddress({ message }), which re-hashes the digest with
 * the EIP-191 personal_sign prefix and would recover the wrong signer.
 */
export function verifyUSDCAuthorizationDigest(
  digest: `0x${string}`,
  signature: { v: number; r: `0x${string}`; s: `0x${string}` },
  expectedOwner: `0x${string}`
): boolean {
  try {
    const sig65 = `0x${signature.r.slice(2)}${signature.s.slice(2)}${signature.v.toString(16).padStart(2, "0")}` as `0x${string}`;
    const recovered = recoverAddress({ hash: digest, signature: sig65 });
    return recovered.toLowerCase() === expectedOwner.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Get USDC EIP-3009 nonce for an address
 */
export async function getUSDCNonce(
  client: PublicClient,
  address: `0x${string}`,
  network: ArcNetwork = getActiveArcNetwork()
): Promise<bigint> {
  return client.readContract({
    address: network.usdcAddress,
    abi: [
      { inputs: [{ name: "owner", type: "address" }], name: "nonces", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" }
    ],
    functionName: "nonces",
    args: [address],
  });
}

/**
 * Get USDC DOMAIN_SEPARATOR
 */
export async function getUSDCDomainSeparator(
  client: PublicClient,
  network: ArcNetwork = getActiveArcNetwork()
): Promise<`0x${string}`> {
  const result = await client.readContract({
    address: network.usdcAddress,
    abi: [{ inputs: [], name: "DOMAIN_SEPARATOR", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" }],
    functionName: "DOMAIN_SEPARATOR",
  });
  return result as `0x${string}`;
}

/**
 * Verify that a USDC authorization signature is valid
 * by computing the digest and recovering the signer
 */
export function verifyUSDCAuthorization(
  params: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  },
  expectedOwner: `0x${string}`
): boolean {
  const digest = computeUSDCAuthorizationDigest(params);
  return verifyUSDCAuthorizationDigest(digest, { v: params.v, r: params.r, s: params.s }, expectedOwner);
}
