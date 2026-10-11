"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { custom } from "viem";
import type { Address } from "viem";

import { usePayments } from "@/components/payments-provider";
import { useTrustedLedger } from "@/components/trusted-ledger-provider";
import { useWallet } from "@/components/wallet-provider";
import { createArcReadClient } from "@/lib/arc/client";
import { getActiveArcNetwork, getArcNetworkByChainId, getExplorerTxUrl } from "@/lib/arc/network";
import { verifyUsdcTransaction } from "@/lib/arc/payment";
import type { PolicyViolation } from "@/lib/agent/policy";
import { createTrustedIntent, verifyTrustedTransaction } from "@/lib/payments/client";
import { selectEntryById, type PaymentEntry } from "@/lib/payments/store";
import { DEMO_AGENT } from "@/lib/demo/agent";
import { getInjectedProvider } from "@/lib/wallet/client";
import { sendUsdcTransfer } from "@/lib/wallet/payment";
import type { EvmAddress, PaymentRequest, Service } from "@/types";

/**
 * Payment flow orchestration.
 *
 * The policy gate now lives on the server: the client asks for an approved
 * payment intent and may not define the amount or recipient itself. If the
 * trusted ledger is unreachable the flow fails closed — it is never treated as
 * "nothing spent yet".
 *
 * This remains the only component that reaches the wallet sender, and only from
 * the user's explicit Confirm click.
 */

export type PaymentGateState =
  | { status: "idle" }
  | { status: "checking"; serviceId: string }
  | {
      status: "blocked";
      kind: "policy" | "recipient";
      serviceId: string;
      reason: string;
      violations: readonly PolicyViolation[];
    }
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      intentId: string;
      serviceId: string;
      serviceName: string;
      request: PaymentRequest;
    };

export type PaymentFlowStatus =
  | "idle"
  | "checking"
  | "blocked"
  | "unavailable"
  | "ready"
  | "pending"
  | "submitted"
  | "confirmed"
  | "failed";

export interface PaymentFlowContextValue {
  gate: PaymentGateState;
  status: PaymentFlowStatus;
  activeEntry: PaymentEntry | null;
  error: string | null;
  isSubmitting: boolean;
  explorerUrl: string | null;
  canSend: boolean;
  requestPayment: (service: Service) => void;
  cancel: () => void;
  dismiss: () => void;
  confirm: () => Promise<void>;
}

const PaymentFlowContext = createContext<PaymentFlowContextValue | null>(null);

const FAIL_CLOSED_MESSAGE =
  "Unable to verify the current spending limit. The payment was blocked.";

export function PaymentFlowProvider({ children }: { children: ReactNode }) {
  const { session, network } = useWallet();
  const { payments, dispatch } = usePayments();
  const { refresh: refreshTrustedLedger } = useTrustedLedger();

  const [gate, setGate] = useState<PaymentGateState>({ status: "idle" });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeEntry = useMemo(
    () => selectEntryById(payments, activeId),
    [payments, activeId],
  );

  const requestPayment = useCallback(
    (service: Service) => {
      setError(null);
      setActiveId(null);
      setGate({ status: "checking", serviceId: service.id });

      void (async () => {
        const result = await createTrustedIntent({
          agentId: DEMO_AGENT.id,
          serviceId: service.id,
          sender: (session.wallet.address as EvmAddress | null) ?? null,
        });

        if (!result.ok) {
          if (result.code === "LEDGER_UNAVAILABLE") {
            setGate({ status: "unavailable", message: FAIL_CLOSED_MESSAGE });
            return;
          }
          if (result.code === "POLICY_BLOCKED") {
            setGate({
              status: "blocked",
              kind: "policy",
              serviceId: service.id,
              reason: result.message,
              violations: [],
            });
            return;
          }
          setGate({ status: "unavailable", message: result.message });
          return;
        }

        const { intent } = result.data;
        const request: PaymentRequest = {
          id: intent.id,
          agentId: DEMO_AGENT.id,
          serviceId: intent.serviceId,
          recipient: intent.recipient as EvmAddress,
          amount: { amount: intent.amount.amount, currency: "USDC" },
          currency: "USDC",
        };

        setGate({
          status: "ready",
          intentId: intent.id,
          serviceId: intent.serviceId,
          serviceName: intent.serviceName,
          request,
        });
      })();
    },
    [session.wallet.address],
  );

  const cancel = useCallback(() => {
    setGate({ status: "idle" });
    setError(null);
  }, []);

  const dismiss = useCallback(() => {
    setGate({ status: "idle" });
    setActiveId(null);
    setError(null);
  }, []);

  const confirm = useCallback(async () => {
    if (gate.status !== "ready" || submitting) return;

    const walletProvider = getInjectedProvider();
    const address = session.wallet.address;

    if (!walletProvider || !address) {
      setError("Connect a wallet before confirming a payment.");
      return;
    }
    if (session.wallet.chainId !== network.chainId) {
      setError(`Switch your wallet to ${network.label} before confirming a payment.`);
      return;
    }

    const request = gate.request;
    setSubmitting(true);
    setError(null);
    setActiveId(request.id);

    // 1. Record the intent locally (cache only — not authoritative).
    dispatch({
      type: "payment/created",
      id: request.id,
      agentId: request.agentId,
      serviceId: request.serviceId,
      serviceName: gate.serviceName,
      recipient: request.recipient,
      chainId: network.chainId,
      amount: request.amount.amount,
      currency: request.currency,
      createdAt: new Date().toISOString(),
    });

    try {
      // 2. Submit through the wallet. Only the explicit Confirm click reaches here.
      const sent = await sendUsdcTransfer({
        provider: walletProvider,
        network,
        request,
        from: address as Address,
      });

      if (!sent.ok) {
        dispatch({
          type: "payment/failed",
          id: request.id,
          reason: sent.error.message,
          at: new Date().toISOString(),
        });
        setError(sent.error.message);
        return;
      }

      // 3. A real hash exists — now it may be marked submitted locally.
      dispatch({
        type: "payment/submitted",
        id: request.id,
        transactionHash: sent.transactionHash,
        at: new Date().toISOString(),
      });

      // 4. The server independently verifies against Arc before it is recorded.
      const verified = await verifyTrustedTransaction({
        intentId: gate.intentId,
        txHash: sent.transactionHash,
      });

      if (verified.ok) {
        dispatch({
          type: "payment/confirmed",
          id: request.id,
          transactionHash: verified.data.record.txHash,
          at: new Date().toISOString(),
        });
        refreshTrustedLedger();
      } else {
        // Local receipt confirmation is not enough: only the trusted ledger
        // decides that a payment counts. Surface the honest reason.
        const message = `${verified.message} The payment is not counted toward your daily limit.`;
        await confirmLocally(sent.transactionHash);
        dispatch({
          type: "payment/failed",
          id: request.id,
          reason: message,
          at: new Date().toISOString(),
        });
        setError(message);
      }

      async function confirmLocally(hash: `0x${string}`) {
        // Wait for the real Arc receipt so the cache reflects reality, even when
        // server verification is unavailable.
        try {
          const client = createArcReadClient(
            network,
            custom({ request: (args) => walletProvider!.request(args) }),
          );
          await verifyUsdcTransaction(client, hash);
        } catch {
          // Ignore — the trusted ledger remains the authority.
        }
      }
    } finally {
      setSubmitting(false);
    }
  }, [gate, submitting, session.wallet.address, session.wallet.chainId, network, dispatch, refreshTrustedLedger]);

  const status = useMemo<PaymentFlowStatus>(() => {
    if (activeEntry) {
      return activeEntry.phase === "idle" ? "pending" : activeEntry.phase;
    }
    switch (gate.status) {
      case "checking":
        return submitting ? "pending" : "checking";
      case "blocked":
        return "blocked";
      case "unavailable":
        return "unavailable";
      case "ready":
        return submitting ? "pending" : "ready";
      default:
        return "idle";
    }
  }, [activeEntry, gate.status, submitting]);

  const explorerUrl = useMemo(() => {
    if (!activeEntry?.transactionHash) return null;
    const chain = getArcNetworkByChainId(activeEntry.chainId) ?? getActiveArcNetwork();
    return getExplorerTxUrl(activeEntry.transactionHash, chain);
  }, [activeEntry]);

  const value = useMemo<PaymentFlowContextValue>(
    () => ({
      gate,
      status,
      activeEntry,
      error,
      isSubmitting: submitting,
      explorerUrl,
      canSend: gate.status === "ready",
      requestPayment,
      cancel,
      dismiss,
      confirm,
    }),
    [
      gate,
      status,
      activeEntry,
      error,
      submitting,
      explorerUrl,
      requestPayment,
      cancel,
      dismiss,
      confirm,
    ],
  );

  return <PaymentFlowContext.Provider value={value}>{children}</PaymentFlowContext.Provider>;
}

export function usePaymentFlow(): PaymentFlowContextValue {
  const context = useContext(PaymentFlowContext);
  if (!context) {
    throw new Error("usePaymentFlow must be used within a PaymentFlowProvider.");
  }
  return context;
}
