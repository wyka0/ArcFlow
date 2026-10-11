"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DEMO_SPENDING_POLICY } from "@/lib/demo/agent";
import { buildSpendingSummary, type SpendingSummary } from "@/lib/agent/policy";
import {
  fetchTrustedHistory,
  type LedgerPersistence,
  type TrustedHistoryPayload,
} from "@/lib/payments/client";
import type { TrustedPayment } from "@/types";

/**
 * The trusted ledger, as seen by the UI.
 *
 * `status` is explicit so the UI can fail closed: an unavailable ledger is never
 * rendered as "$0 spent".
 */
export type TrustedLedgerState =
  | { status: "loading" }
  | { status: "available"; records: TrustedPayment[]; spending: SpendingSummary; persistence: LedgerPersistence }
  | { status: "unavailable"; message: string };

export interface TrustedLedgerContextValue {
  state: TrustedLedgerState;
  refresh: () => void;
  /**
   * Applies a spending summary returned by the API, so the UI stays in sync
   * without a second round trip.
   */
  applySpending: (spending: SpendingSummary) => void;
  applyPayload: (payload: TrustedHistoryPayload) => void;
}

const TrustedLedgerContext = createContext<TrustedLedgerContextValue | null>(null);

const EMPTY_SPENDING: SpendingSummary = buildSpendingSummary(DEMO_SPENDING_POLICY, []);

export function TrustedLedgerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrustedLedgerState>({ status: "loading" });

  const load = useCallback(async () => {
    const result = await fetchTrustedHistory();
    if (result.ok) {
      setState({
        status: "available",
        records: result.data.records,
        spending: result.data.spending,
        persistence: result.data.persistence,
      });
    } else {
      setState({ status: "unavailable", message: result.message });
    }
  }, []);

  useEffect(() => {
    // External-system synchronisation: fetch the trusted ledger once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  const applySpending = useCallback((spending: SpendingSummary) => {
    setState((current) =>
      current.status === "available" ? { ...current, spending } : current,
    );
  }, []);

  const applyPayload = useCallback((payload: TrustedHistoryPayload) => {
    setState({
      status: "available",
      records: payload.records,
      spending: payload.spending,
      persistence: payload.persistence,
    });
  }, []);

  const value = useMemo<TrustedLedgerContextValue>(
    () => ({ state, refresh, applySpending, applyPayload }),
    [state, refresh, applySpending, applyPayload],
  );

  return <TrustedLedgerContext.Provider value={value}>{children}</TrustedLedgerContext.Provider>;
}

export function useTrustedLedger(): TrustedLedgerContextValue {
  const context = useContext(TrustedLedgerContext);
  if (!context) {
    throw new Error("useTrustedLedger must be used within a TrustedLedgerProvider.");
  }
  return context;
}

/** Spending summary, or null when the trusted ledger is unavailable. */
export function selectTrustedSpending(state: TrustedLedgerState): SpendingSummary | null {
  return state.status === "available" ? state.spending : null;
}

export const ZERO_SPENDING = EMPTY_SPENDING;
