"use server";

import type { WalletClient } from "viem";

import { getActiveArcNetwork, type ArcNetwork } from "../../arc/network";

import {
  ARCFLOW_V2_EXECUTE_TYPEHASH,
  buildArcFlowV2ExecuteTypedDataMessage,
  computeArcFlowV2DomainSeparator,
} from "./arcflow-eip712";
import { parseEIP712Signature } from "./arc-usdc-eip3009";

/**
 * Server-only module for ArcFlow V2 EIP-712 Authorization
 * 
 * Contains functions that require server-side wallet access.
 * This module should only be imported by server components or server actions.
 */

/**
 * Sign ArcFlow V2 authorization with wallet
 * This function requires server-side wallet access and should only be called from server components or server actions.
 *
 * Phase 21.3: signature parsing delegates to the shared validated helper
 * (exactly 65 bytes; recovery id normalized to the contract's 27/28 form).
 * Digest semantics unchanged: buildArcFlowV2ExecuteTypedDataMessage (fail
 * closed on unconfigured V2 address) + signTypedData — no EIP-191 re-hash.
 */
export async function signArcFlowV2Authorization(
  walletClient: WalletClient,
  account: `0x${string}`,
  params: {
    flowId: bigint;
    amount: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  }
): Promise<{ v: number; r: `0x${string}`; s: `0x${string}` }> {
  const typedData = buildArcFlowV2ExecuteTypedDataMessage(params);

  const signature = await walletClient.signTypedData({
    account,
    domain: typedData.domain,
    types: typedData.types,
    primaryType: "ExecuteWithAuthorization",
    message: typedData.message,
  });

  return parseEIP712Signature(signature);
}