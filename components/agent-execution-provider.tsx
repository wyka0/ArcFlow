"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type { Address } from "viem";

import { useWallet } from "@/components/wallet-provider";
import { sendUsdcTransfer } from "@/lib/wallet/payment";
import { getInjectedProvider } from "@/lib/wallet/client";
import { DEMO_AGENT } from "@/lib/demo/agent";
import { getService } from "@/lib/services/registry";
import { createTrustedIntent, verifyTrustedTransaction } from "@/lib/payments/client";
import type { ApprovedPaymentIntent, AgentExecutionState, AgentExecutionPhase, AgentExecutionAction } from "@/lib/agent/execution";
import { initialAgentExecutionState, agentExecutionReducer } from "@/lib/agent/execution";

/**
 * Agent execution orchestration.
 *
 * This is the controlled agent execution loop. The agent:
 * 1. Selects a service
 * 2. Requests an approved payment intent from the server
 * 3. Executes the approved intent through the wallet
 * 4. Submits the transaction hash for server verification
 * 5. Receives trusted confirmation
 *
 * The server remains the sole authority throughout.
 */

export type AgentExecutionContextValue = {
  state: AgentExecutionState;
  canExecute: boolean;
  execute: (serviceId: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  confirmExecution: () => Promise<void>;
};

const AgentExecutionContext = createContext<AgentExecutionContextValue | null>(null);

const FAIL_CLOSED_MESSAGE = "Unable to verify the current spending limit. The execution was blocked.";

export function AgentExecutionProvider({ children }: { children: ReactNode }) {
  const { session, network } = useWallet();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [state, dispatch] = useReducer(agentExecutionReducer, initialAgentExecutionState);

  const execute = useCallback(
    async (serviceId: string) => {
      dispatch({ type: "execution/start", serviceId });

      const service = getService(serviceId);
      if (!service) {
        dispatch({ type: "execution/intent_rejected", reason: "Service not found.", code: "UNKNOWN_SERVICE" });
        return;
      }

      if (!service.active) {
        dispatch({ type: "execution/intent_rejected", reason: "Service is not active.", code: "SERVICE_INACTIVE" });
        return;
      }

      const result = await createTrustedIntent({
        agentId: DEMO_AGENT.id,
        serviceId,
        sender: (session.wallet.address as `0x${string}` | null) ?? null,
      });

      if (!result.ok) {
        if (result.code === "LEDGER_UNAVAILABLE") {
          dispatch({ type: "execution/intent_rejected", reason: FAIL_CLOSED_MESSAGE, code: result.code });
          return;
        }
        if (result.code === "POLICY_BLOCKED") {
          dispatch({ type: "execution/intent_rejected", reason: result.message, code: result.code });
          return;
        }
        dispatch({ type: "execution/intent_rejected", reason: result.message, code: result.code });
        return;
      }

      const intent = result.data.intent as ApprovedPaymentIntent;
      dispatch({ type: "execution/intent_approved", intent });
    },
    [session.wallet.address],
  );

  const confirmExecution = useCallback(async () => {
    if (state.phase !== "intent_approved" || isSubmitting) return;

    const walletProvider = getInjectedProvider();
    const address = session.wallet.address;

    if (!walletProvider || !address) {
      dispatch({ type: "execution/intent_rejected", reason: "Connect a wallet before confirming execution.", code: "WALLET_NOT_CONNECTED" });
      return;
    }
    if (session.wallet.chainId !== network.chainId) {
      dispatch({ type: "execution/intent_rejected", reason: `Switch your wallet to ${network.label} before confirming execution.`, code: "WRONG_NETWORK" });
      return;
    }

    if (!state.approvedIntent) {
      dispatch({ type: "execution/intent_rejected", reason: "No approved intent available.", code: "NO_INTENT" });
      return;
    }

    dispatch({ type: "execution/submit", transactionHash: "" as `0x${string}` } as AgentExecutionAction);
    setIsSubmitting(true);

    try {
      // Execute through wallet using the exact approved intent values
      const sent = await sendUsdcTransfer({
        provider: walletProvider,
        network,
        request: {
          id: state.approvedIntent.id,
          agentId: state.approvedIntent.agentId,
          serviceId: state.approvedIntent.serviceId,
          recipient: state.approvedIntent.recipient,
          amount: state.approvedIntent.amount,
          currency: state.approvedIntent.currency,
        },
        from: address as Address,
      });

      if (!sent.ok) {
        dispatch({ type: "execution/failed", reason: sent.error.message, failureReason: sent.error.message } as AgentExecutionAction);
        return;
      }

      // Transaction submitted — now verify with trusted server
      dispatch({ type: "execution/verify_start" } as AgentExecutionAction);

      const verified = await verifyTrustedTransaction({
        intentId: state.approvedIntent.id,
        txHash: sent.transactionHash,
      });

      if (verified.ok) {
        dispatch({ type: "execution/confirmed", record: verified.data.record } as AgentExecutionAction);
      } else {
        // Server verification failed — payment not counted
        const message = `${verified.message} The payment is not counted toward your daily limit.`;
        dispatch({ type: "execution/failed", reason: message, failureReason: verified.message } as AgentExecutionAction);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution failed.";
      dispatch({ type: "execution/failed", reason: message, failureReason: message } as AgentExecutionAction);
    } finally {
      setIsSubmitting(false);
    }
  }, [state.phase, state.approvedIntent, isSubmitting, session.wallet.address, session.wallet.chainId, network]);

  const cancel = useCallback(() => {
    dispatch({ type: "execution/intent_rejected", reason: "Cancelled by user.", code: "USER_CANCELLED" } as AgentExecutionAction);
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "execution/reset" } as AgentExecutionAction);
  }, []);

  const value = useMemo<AgentExecutionContextValue>(
    () => ({
      state,
      canExecute: state.phase === "idle" || state.phase === "intent_rejected" || state.phase === "failed",
      execute,
      cancel,
      reset,
      confirmExecution,
    }),
    [state, execute, cancel, reset, confirmExecution],
  );

  return <AgentExecutionContext.Provider value={value}>{children}</AgentExecutionContext.Provider>;
}

export function useAgentExecution(): AgentExecutionContextValue {
  const context = useContext(AgentExecutionContext);
  if (!context) {
    throw new Error("useAgentExecution must be used within an AgentExecutionProvider.");
  }
  return context;
}

export function selectAgentExecutionPhase(state: AgentExecutionState): AgentExecutionPhase {
  return state.phase;
}

export function selectApprovedIntent(state: AgentExecutionState): ApprovedPaymentIntent | null {
  return state.approvedIntent;
}

export function selectTransactionHash(state: AgentExecutionState): `0x${string}` | null {
  return state.transactionHash;
}

export function selectFailureReason(state: AgentExecutionState): string | null {
  return state.failureReason;
}

export function selectExecutionError(state: AgentExecutionState): string | null {
  return state.error;
}