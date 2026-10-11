import { keccak256, toHex, hexToBytes, concat, encodeAbiParameters, recoverAddress } from "viem";

import { 
  ARC_USDC_DOMAIN_SEPARATOR, 
  ARC_USDC_EIP3009_TYPEHASH 
} from "./authorization-types";

import type { Hex } from "viem";

/**
 * Authorization Recovery Module
 * 
 * Provides local signature verification and recovery for:
 * - Arc USDC EIP-3009 signatures
 * - ArcFlow V2 EIP-712 signatures
 * 
 * Used for local verification without mainnet calls.
 */

const ARCFLOW_V2_EXECUTE_TYPEHASH = keccak256(toHex("ExecuteWithAuthorization(uint256 flowId,uint256 amount,uint256 validAfter,uint256 validBefore,bytes32 nonce)"));

/**
 * Resolve the ArcFlow V2 contract address from runtime configuration and
 * fail closed when unconfigured. Security invariant (Phase 10.8): no
 * authorization digest may be constructed against a hardcoded fallback
 * address; the only deployed V2 candidate is UNVERIFIED.
 */
function requireConfiguredV2Address(): `0x${string}` {
  const configured = process.env.NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS?.trim();
  if (!configured || configured.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(configured)) {
    throw new Error(
      "ArcFlowV2 contract address is not configured. Set NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS " +
      "to an independently verified deployment before constructing V2 authorizations."
    );
  }
  return configured as `0x${string}`;
}

/**
 * Compute the ArcFlow V2 domain separator
 */
function computeArcFlowV2DomainSeparator(params: {
  chainId: number;
  verifyingContract: `0x${string}`;
}): `0x${string}` {
  const DOMAIN_TYPEHASH = keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
  const NAME_HASH = keccak256(toHex("ArcFlow"));
  const VERSION_HASH = keccak256(toHex("1"));
  
  const encoded = encodeAbiParameters(
    [
      { type: "bytes32", name: "typehash" },
      { type: "bytes32", name: "name" },
      { type: "bytes32", name: "version" },
      { type: "uint256", name: "chainId" },
      { type: "address", name: "verifyingContract" },
    ],
    [
      DOMAIN_TYPEHASH,
      keccak256(toHex("ArcFlow")),
      keccak256(toHex("1")),
      BigInt(params.chainId),
      params.verifyingContract,
    ]
  );

  return keccak256(encoded);
}

/**
 * Compute the EIP-712 digest for Arc USDC transferWithAuthorization
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
  const digest = keccak256(concat([
    hexToBytes("0x1901"),
    hexToBytes(DOMAIN_SEPARATOR),
    hexToBytes(structHash)
  ]));

  return digest;
}

/**
 * Verify a USDC authorization signature by recovering the signer
 * Returns the recovered address
 */
export function recoverUSDCAuthorizationSigner(
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
  }
): `0x${string}` {
  const digest = computeUSDCAuthorizationDigest({
    from: params.from,
    to: params.to,
    value: params.value,
    validAfter: params.validAfter,
    validBefore: params.validBefore,
    nonce: params.nonce,
  });

  // Recover address from signature using viem's recoverAddress
  const signature = concatSignature(params.r, params.s, params.v);
  const recovered = recoverAddress({ digest, signature });
  
  return recovered as `0x${string}`;
}

/**
 * Verify a USDC authorization signature locally
 * Returns true if the recovered address matches the expected owner
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
  const recovered = recoverUSDCAuthorizationSigner({
    from: params.from,
    to: params.to,
    value: params.value,
    validAfter: params.validAfter,
    validBefore: params.validBefore,
    nonce: params.nonce,
    v: params.v,
    r: params.r,
    s: params.s,
  });

  return recovered.toLowerCase() === expectedOwner.toLowerCase();
}

/**
 * Compute the EIP-712 digest for ArcFlow V2 ExecuteWithAuthorization
 */
export function computeArcFlowV2AuthorizationDigest(
  params: {
    flowId: bigint;
    amount: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  }
): `0x${string}` {
  // Domain separator — fail closed on unconfigured V2 address.
  const domainSeparator = computeArcFlowV2DomainSeparator({
    chainId: 5042,
    verifyingContract: requireConfiguredV2Address(),
  });

  // Struct hash
  const structHash = keccak256(encodeAbiParameters(
    [
      { type: "bytes32", name: "typehash" },
      { type: "uint256", name: "flowId" },
      { type: "uint256", name: "amount" },
      { type: "uint256", name: "validAfter" },
      { type: "uint256", name: "validBefore" },
      { type: "bytes32", name: "nonce" },
    ],
    [
      ARCFLOW_V2_EXECUTE_TYPEHASH,
      params.flowId,
      params.amount,
      params.validAfter,
      params.validBefore,
      params.nonce,
    ]
  ));

  // Final digest: keccak256("\x19\x01" || DOMAIN_SEPARATOR || structHash)
  const digest = keccak256(concat([
    hexToBytes("0x1901"),
    hexToBytes(domainSeparator),
    hexToBytes(structHash)
  ]));

  return digest;
}

/**
 * Verify an ArcFlow V2 authorization signature
 */
export function verifyArcFlowV2Authorization(
  params: {
    flowId: bigint;
    amount: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  },
  expectedOwner: `0x${string}`
): boolean {
  const digest = computeArcFlowV2AuthorizationDigest({
    flowId: params.flowId,
    amount: params.amount,
    validAfter: params.validAfter,
    validBefore: params.validBefore,
    nonce: params.nonce,
  });

  // Recover address from signature
  const signature = concatSignature(params.r, params.s, params.v);
  const recovered = recoverAddress({ digest, signature });
  
  return recovered.toLowerCase() === expectedOwner.toLowerCase();
}

/**
 * Concatenate signature components into 65-byte signature
 */
function concatSignature(r: `0x${string}`, s: `0x${string}`, v: number): `0x${string}` {
  const rBytes = r.slice(2).padStart(64, "0");
  const sBytes = s.slice(2).padStart(64, "0");
  const vByte = v.toString(16).padStart(2, "0");
  return ("0x" + rBytes + sBytes + vByte) as `0x${string}`;
}
