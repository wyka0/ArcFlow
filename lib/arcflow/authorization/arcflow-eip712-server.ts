"use server";

import type { WalletClient } from "viem";

import { getActiveArcNetwork, type ArcNetwork } from "../../arc/network";

import {
  ARCFLOW_V2_EXECUTE_TYPEHASH,
  buildArcFlowV2ExecuteTypedDataMessage,
  computeArcFlowV2DomainSeparator,
} from "./arcflow-eip712";

/**
 * Server-only module for ArcFlow V2 EIP-712 Authorization
 * 
 * Contains functions that require server-side wallet access.
 * This module should only be imported by server components or server actions.
 */

/**
 * Sign ArcFlow V2 authorization with wallet
 * This function requires server-side wallet access and should only be called from server components or server actions.
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

  const sig = signature as `0x${string}`;
  const r = sig.slice(0, 66) as `0x${string}`;
  const s = "0x" + sig.slice(66, 130) as `0x${string}`;
  const v = parseInt(sig.slice(130, 132), 16);

  return { v, r, s };
}