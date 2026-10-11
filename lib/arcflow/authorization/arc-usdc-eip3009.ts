import { keccak256, encodeAbiParameters, toHex, hexToBytes, concat, recoverAddress, parseSignature } from "viem";
import type { TypedDataDomain, PublicClient, WalletClient } from "viem";

import { getActiveArcNetwork, type ArcNetwork } from "../../arc/network";
import {
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

/**
 * Build USDC EIP-3009 typed data for signing transferWithAuthorization.
 *
 * Phase 21.3: the previous nine-field variant (`v, r, s` in the TYPES with a
 * six-field message) was removed — those fields belong to the on-chain
 * FUNCTION CALL ABI, never to the signed EIP-712 struct. The signed struct is
 * exactly the six fields of the verified on-chain typehash:
 * TransferWithAuthorization(address from,address to,uint256 value,
 *   uint256 validAfter,uint256 validBefore,bytes32 nonce)
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
): { domain: TypedDataDomain; types: { TransferWithAuthorization: readonly { name: string; type: string }[] }; message: { from: `0x${string}`; to: `0x${string}`; value: bigint; validAfter: bigint; validBefore: bigint; nonce: `0x${string}` } } {
  return {
    domain: {
      name: "USDC",
      version: "2",
      chainId: 5042,
      verifyingContract: "0x3600000000000000000000000000000000000000",
    },
    // Signing types MUST match the on-chain EIP-3009 typehash exactly:
    // TransferWithAuthorization(address from,address to,uint256 value,
    //   uint256 validAfter,uint256 validBefore,bytes32 nonce)
    // v/r/s are the OUTPUT of signing and must never appear in the signed
    // struct — including them would bind signatures to a struct the
    // contract's typehash can never verify.
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
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

  // Parse signature into v, r, s with strict validation and normalization
  // (exactly 65 bytes; recovery id normalized to the contract's 27/28 form).
  return parseEIP712Signature(signature);
}

/**
 * Parse a 65-byte EIP-712 wallet signature into (v, r, s) components with
 * strict validation (Phase 21.3 shared helper):
 *   - exactly 0x + 130 hex chars (65 bytes) required;
 *   - components parsed by viem's parseSignature (no manual slicing);
 *   - recovery id normalized to 27/28 (yParity 0/1 form → 27/28), matching
 *     what the on-chain ECDSA pre-check accepts.
 * Malformed values throw — they are never silently truncated or padded.
 */
export function parseEIP712Signature(signature: `0x${string}`): {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
} {
  if (signature.length !== 132) {
    throw new Error(
      `Unexpected signature length from wallet: expected 132 hex chars (65 bytes), got ${signature.length}`,
    );
  }
  const parsed = parseSignature(signature);
  const v = parsed.v !== undefined ? Number(parsed.v) : 27 + parsed.yParity;
  return { r: parsed.r, s: parsed.s, v };
}

/**
 * Left-pad signature components to exactly 32 bytes. Components longer than
 * 32 bytes are rejected (fail closed) rather than truncated.
 */
function padSignatureComponent(component: Uint8Array): Uint8Array {
  if (component.length > 32) {
    throw new Error("signature component exceeds 32 bytes");
  }
  const padded = new Uint8Array(32);
  padded.set(component, 32 - component.length);
  return padded;
}

/**
 * Verify that a USDC authorization signature is valid
 * by recovering the signer directly from the EIP-712 digest.
 *
 * IMPORTANT: EIP-712 digests must be recovered with recoverAddress({ hash })
 * — NOT recoverMessageAddress({ message }), which re-hashes the digest with
 * the EIP-191 personal_sign prefix and would recover the wrong signer.
 */
export async function verifyUSDCAuthorizationDigest(
  digest: `0x${string}`,
  signature: { v: number; r: `0x${string}`; s: `0x${string}` },
  expectedOwner: `0x${string}`
): Promise<boolean> {
  try {
    // Build the 65-byte signature from validated components. viem's
    // recoverAddress expects { hash, signature } and performs raw ECDSA
    // recovery over the EIP-712 digest — no EIP-191 re-hashing.
    // Invalid components (odd-length hex, >32 bytes, invalid v) fail closed.
    if (![0, 1, 27, 28].includes(signature.v)) {
      return false;
    }
    const sig65 = concat([
      padSignatureComponent(hexToBytes(signature.r)),
      padSignatureComponent(hexToBytes(signature.s)),
      new Uint8Array([signature.v <= 1 ? signature.v : signature.v - 27]),
    ]);
    const recovered = await recoverAddress({ hash: digest, signature: sig65 });
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
export async function verifyUSDCAuthorization(
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
): Promise<boolean> {
  const digest = computeUSDCAuthorizationDigest(params);
  return await verifyUSDCAuthorizationDigest(digest, { v: params.v, r: params.r, s: params.s }, expectedOwner);
}
