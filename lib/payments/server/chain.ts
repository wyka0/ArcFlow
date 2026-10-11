import { http, createPublicClient } from "viem";

import { getArcRpcUrl, type ArcNetwork } from "@/lib/arc/network";

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
