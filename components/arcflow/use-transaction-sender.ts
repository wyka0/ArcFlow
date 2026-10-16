"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { createArcReadClient } from "@/lib/arc/client";
import { verifyUsdcTransaction } from "@/lib/arc/payment";
import type { PreparedTransaction } from "@/lib/arcflow/interactions";
import type { TransactionHash } from "@/lib/arcflow";
import { submitTransaction, type SubmittedTransaction } from "@/lib/arcflow/send-transaction";

type SendTransactionResult = SubmittedTransaction;

interface UseTransactionSenderReturn {
  sendTransaction: (tx: PreparedTransaction) => Promise<SendTransactionResult>;
  isSending: boolean;
  error: string | null;
}

/**
 * Hook for sending transactions via the connected wallet.
 *
 * All submission logic lives in `submitTransaction` (a pure, unit-tested core):
 * a pre-submission chain/account guard, standards-compatible EIP-1193 params,
 * and revert-vs-unknown receipt classification. This hook only adds React state.
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
      return await submitTransaction({
        provider,
        transaction: tx,
        expectedAccount: address,
        verify: (hash) => {
          const publicClient = createArcReadClient(network);
          return verifyUsdcTransaction(publicClient, hash as TransactionHash, { confirmations: 1 });
        },
      });
    } catch (err) {
      const failure = err instanceof Error ? err : new Error("Transaction failed");
      setError(failure.message);
      // Re-throw the ORIGINAL error so callers can distinguish a confirmed
      // revert from an unknown outcome (e.g. `UnknownTransactionOutcomeError`).
      throw failure;
    } finally {
      setIsSending(false);
    }
  }, [providerRef, session.wallet.address, network]);

  return { sendTransaction, isSending, error };
}
