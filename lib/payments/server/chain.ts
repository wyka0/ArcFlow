import { http, createPublicClient } from "viem";

import { getArcRpcUrl, type ArcNetwork } from "@/lib/arc/network";
import {
  ARCFLOW_ABI,
  getArcFlowContractAddress,
  isArcFlowConfigured,
} from "@/lib/arcflow/contract";
import type { EvmAddress } from "@/types";

import type { MinimalReceipt } from "./verify";

/**
 * Server-side Arc chain reader.
 *
 * Read-only: it can fetch a chain id and a transaction receipt. There is no
 * signing, no key material, and no send path in this module.
 */
export interface ArcChainReader {
  getChainId(): Promise<number | null>;
  getTransactionReceipt(transactionHash: `0x${string}`): Promise<MinimalReceipt | null>;
}

export function createArcChainReader(network: ArcNetwork): ArcChainReader {
  const client = createPublicClient({
    chain: network.chain,
    transport: http(getArcRpcUrl(network)),
  });

  return {
    async getChainId(): Promise<number | null> {
      try {
        return await client.getChainId();
      } catch {
        return null;
      }
    },

    async getTransactionReceipt(transactionHash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: transactionHash });
        return {
          status: receipt.status,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          from: receipt.from,
          to: receipt.to,
          logs: receipt.logs.map((log) => ({
            address: log.address,
            topics: log.topics,
            data: log.data,
          })),
        };
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// ArcFlow flow reader (Phase 49B.12.3)
//
// Additive: `ArcChainReader` above is unchanged so existing agent-payment
// consumers and test doubles keep working. This reader adds the single
// read-only capability flow-execution verification needs: the authoritative
// flow configuration (`getFlow`).
// ---------------------------------------------------------------------------

/** Authoritative on-chain flow configuration (from `getFlow`). */
export interface OnChainFlow {
  owner: EvmAddress;
  treasury: EvmAddress;
  contributor: EvmAddress;
  treasuryBps: number;
  contributorBps: number;
  threshold: bigint;
  active: boolean;
}

/**
 * Result of reading a flow from the contract. A missing flow and an unreadable
 * network are distinct so callers can fail closed with an honest reason.
 */
export type ReadOnChainFlowResult =
  | { status: "ok"; flow: OnChainFlow }
  | { status: "not_found" }
  | { status: "unavailable" };

/**
 * Read-only ArcFlow chain reader. Extends the agent-payment reader surface with
 * `readFlow`; existing consumers of `ArcChainReader` are unaffected.
 */
export interface ArcFlowChainReader extends ArcChainReader {
  readFlow(flowId: bigint): Promise<ReadOnChainFlowResult>;
}

let flowReaderOverride: ArcFlowChainReader | null = null;

/** Test seam — never call from production code. */
export function setArcFlowChainReaderForTesting(reader: ArcFlowChainReader | null): void {
  flowReaderOverride = reader;
}

/**
 * Map a decoded `getFlow` result. Handles both the named object form (named
 * ABI outputs) and a positional tuple, and fails closed (returns `null`) on any
 * unexpected shape rather than fabricating a flow.
 */
function mapOnChainFlow(raw: unknown): OnChainFlow | null {
  let record: {
    owner?: unknown;
    treasury?: unknown;
    contributor?: unknown;
    treasuryBps?: unknown;
    contributorBps?: unknown;
    threshold?: unknown;
    active?: unknown;
  };

  if (Array.isArray(raw)) {
    const [owner, treasury, contributor, treasuryBps, contributorBps, threshold, active] =
      raw as unknown[];
    record = { owner, treasury, contributor, treasuryBps, contributorBps, threshold, active };
  } else if (typeof raw === "object" && raw !== null) {
    record = raw as typeof record;
  } else {
    return null;
  }

  const { owner, treasury, contributor, treasuryBps, contributorBps, threshold, active } = record;
  if (
    typeof owner !== "string" ||
    typeof treasury !== "string" ||
    typeof contributor !== "string" ||
    (typeof treasuryBps !== "number" && typeof treasuryBps !== "bigint") ||
    (typeof contributorBps !== "number" && typeof contributorBps !== "bigint") ||
    typeof threshold !== "bigint" ||
    typeof active !== "boolean"
  ) {
    return null;
  }

  return {
    owner: owner as EvmAddress,
    treasury: treasury as EvmAddress,
    contributor: contributor as EvmAddress,
    treasuryBps: Number(treasuryBps),
    contributorBps: Number(contributorBps),
    threshold,
    active,
  };
}

/** Walks the error (and its `cause` chain) for a viem contract-revert error. */
function isRevertError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const name =
      typeof current === "object" && current !== null && "name" in current
        ? (current as { name?: unknown }).name
        : undefined;
    if (typeof name === "string" && name.includes("Revert")) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function createArcFlowChainReader(network: ArcNetwork): ArcFlowChainReader {
  if (flowReaderOverride) return flowReaderOverride;

  const client = createPublicClient({
    chain: network.chain,
    transport: http(getArcRpcUrl(network)),
  });

  return {
    async getChainId(): Promise<number | null> {
      try {
        return await client.getChainId();
      } catch {
        return null;
      }
    },

    async getTransactionReceipt(transactionHash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: transactionHash });
        return {
          status: receipt.status,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          from: receipt.from,
          to: receipt.to,
          logs: receipt.logs.map((log) => ({
            address: log.address,
            topics: log.topics,
            data: log.data,
          })),
        };
      } catch {
        return null;
      }
    },

    async readFlow(flowId) {
      if (!isArcFlowConfigured(network)) {
        return { status: "unavailable" };
      }
      try {
        const raw = await client.readContract({
          address: getArcFlowContractAddress(network),
          abi: ARCFLOW_ABI,
          functionName: "getFlow",
          args: [flowId],
        });
        const flow = mapOnChainFlow(raw);
        return flow ? { status: "ok", flow } : { status: "unavailable" };
      } catch (error) {
        if (isRevertError(error)) {
          return { status: "not_found" };
        }
        return { status: "unavailable" };
      }
    },
  };
}
