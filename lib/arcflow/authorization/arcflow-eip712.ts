"use client";

import { keccak256, encodeAbiParameters, toHex, hexToBytes, concat } from "viem";
import type { TypedDataDomain } from "viem";

import { getActiveArcNetwork, type ArcNetwork } from "../../arc/network";

import { requireArcFlowV2ContractAddress } from "./authorization-types";

/**
 * ArcFlow V2 EIP-712 Authorization Module
 * 
 * Handles signing and verification of ArcFlow V2 ExecuteWithAuthorization
 * 
 * Domain:
 *   name: "ArcFlow"
 *   version: "1"
 *   chainId: 5042
 *   verifyingContract: ArcFlowV2 contract address
 * 
 * Type:
 *   ExecuteWithAuthorization(uint256 flowId,uint256 amount,uint256 validAfter,uint256 validBefore,bytes32 nonce)
 */

// Canonical typehash for ExecuteWithAuthorization
export const ARCFLOW_V2_EXECUTE_TYPEHASH = keccak256(toHex("ExecuteWithAuthorization(uint256 flowId,uint256 amount,uint256 validAfter,uint256 validBefore,bytes32 nonce)"));

export function getArcFlowV2EIP712Domain(network: ArcNetwork): TypedDataDomain {
  return {
    name: "ArcFlow",
    version: "1",
    chainId: network.chainId,
    // Fail closed (Phase 21.3): never a "0x" placeholder verifying contract.
    verifyingContract: requireConfiguredV2Address(),
  };
}

/**
 * Resolve the ArcFlow V2 contract address from runtime configuration and
 * fail closed when unconfigured.
 *
 * Security invariant (Phase 10.8): no authorization digest or typed data may
 * ever be constructed against a hardcoded fallback address. The only V2
 * candidate ever deployed (0xf0c80Fdd…) is UNVERIFIED — signing against it
 * would bind user signatures to an unvalidated contract. Callers must set
 * NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS to the deployment that has passed
 * independent review.
 *
 * Phase 21.3: delegates to the single canonical resolver in
 * authorization-types.ts (which also rejects the zero address and the
 * deprecated predecessor) — no more per-module copies.
 */
function requireConfiguredV2Address(): `0x${string}` {
  return requireArcFlowV2ContractAddress();
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
  },
  network: ArcNetwork = getActiveArcNetwork()
): `0x${string}` {
  // Domain separator for ArcFlow V2
  const domainSeparator = computeArcFlowV2DomainSeparator({
    chainId: network.chainId,
    verifyingContract: requireConfiguredV2Address(),
  });

  // Compute struct hash using viem's encodeAbiParameters
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
 * Compute the ArcFlow V2 domain separator using viem
 */
export function computeArcFlowV2DomainSeparator(params: {
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
      NAME_HASH,
      VERSION_HASH,
      BigInt(params.chainId),
      params.verifyingContract,
    ]
  );

  return keccak256(encoded);
}

/**
 * Build ArcFlow V2 EIP-712 typed data for ExecuteWithAuthorization signing
 */
export function buildArcFlowV2ExecuteTypedData(
  params: {
    flowId: bigint;
    amount: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  },
  network: ArcNetwork = getActiveArcNetwork()
): { domain: TypedDataDomain; types: { ExecuteWithAuthorization: readonly { name: string; type: string }[] }; message: { flowId: bigint; amount: bigint; validAfter: bigint; validBefore: bigint; nonce: `0x${string}` } } {
  return {
    domain: {
      name: "ArcFlow",
      version: "1",
      chainId: network.chainId,
      verifyingContract: requireConfiguredV2Address(),
    },
    types: {
      ExecuteWithAuthorization: [
        { name: "flowId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    message: params,
  };
}

/**
 * Compute the ArcFlow V2 authorization digest using the standard EIP-712 formula
 */
export function computeArcFlowV2AuthorizationDigestDirect(
  params: {
    flowId: bigint;
    amount: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  }
): `0x${string}` {
  // Domain separator — fail closed on unconfigured V2 address (no hardcoded fallback).
  const domainSeparator = computeArcFlowV2DomainSeparator({
    chainId: 5042,
    verifyingContract: requireConfiguredV2Address(),
  });

  // Struct hash: keccak256(abi.encode(TYPEHASH, flowId, amount, validAfter, validBefore, nonce))
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

  // Final digest: keccak256("\x19\x01" || domainSeparator || structHash)
  const digest = keccak256(concat([
    hexToBytes("0x1901"),
    hexToBytes(domainSeparator),
    hexToBytes(structHash)
  ]));

  return digest;
}

/**
 * ArcFlow V2 EIP-712 typed data for signing
 */
export function buildArcFlowV2ExecuteTypedDataMessage(
  params: {
    flowId: bigint;
    amount: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  }
): { domain: TypedDataDomain; types: { ExecuteWithAuthorization: readonly { name: string; type: string }[] }; message: { flowId: bigint; amount: bigint; validAfter: bigint; validBefore: bigint; nonce: `0x${string}` } } {
  return {
    domain: {
      name: "ArcFlow",
      version: "1",
      chainId: 5042,
      // Fail closed on unconfigured V2 address (no hardcoded fallback).
      verifyingContract: requireConfiguredV2Address(),
    },
    types: {
      ExecuteWithAuthorization: [
        { name: "flowId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    message: params,
  };
}


/**
 * Compute the struct hash for EIP-712
 */
export function computeStructHash(
  types: Array<{ type: string; name: string }>,
  values: unknown[]
): `0x${string}` {
  return keccak256(encodeAbiParameters(
    types.map(t => ({ type: t.type, name: t.name })),
    values
  ));
}
