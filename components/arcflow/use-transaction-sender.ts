"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { createArcReadClient } from "@/lib/arc/client";
import { getActiveArcNetwork, type ArcNetwork } from "@/lib/arc/network";
import { verifyUsdcTransaction } from "@/lib/arc/payment";
import type { PreparedTransaction } from "@/lib/arcflow/interactions";
import type { TransactionHash } from "@/lib/arcflow";

interface SendTransactionResult {
  transactionHash: TransactionHash;
  blockNumber: bigint;
}

interface UseTransactionSenderReturn {
  sendTransaction: (tx: PreparedTransaction) => Promise<SendTransactionResult>;
  isSending: boolean;
  error: string | null;
}

/**
 * Hook for sending transactions via the connected wallet.
 * Uses the existing wallet provider's EIP-1193 provider.
 */
export function useTransactionSender(): UseTransactionSenderReturn {
  const { session, providerRef, network } = useWallet();
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const sendTransaction = useCallback(async (tx: PreparedTransaction): Promise<SendTransactionResult> => {
    const provider = providerRef.current;
    if (!provider) {
      throw new Error("No wallet provider available");
    }

    const address = session.wallet.address;
    if (!address) {
      throw new Error("Wallet not connected");
    }

    setIsSending(true);
    setError(null);

    try {
      // Send transaction via EIP-1193
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: tx.to,
          data: tx.data,
          value: "0x0",
          chainId: `0x${tx.chainId.toString(16)}`,
        }],
      });

      if (typeof hash !== "string" || !hash.startsWith("0x")) {
        throw new Error("Invalid transaction hash returned");
      }

      // Wait for confirmation using public client
      const publicClient = createArcReadClient(network);
      
      const result = await verifyUsdcTransaction(publicClient, hash as TransactionHash, { confirmations: 1 });
      
      if (!result.ok) {
        throw new Error(result.message);
      }

      return {
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setError(message);
      throw new Error(message);
    } finally {
      setIsSending(false);
    }
  }, [providerRef, session.wallet.address, network]);

  return { sendTransaction, isSending, error };
}