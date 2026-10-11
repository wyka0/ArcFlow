"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { getPaymentRepository } from "@/lib/payments/repository";
import type { PersistenceDescriptor } from "@/lib/payments/storage";
import {
  initialPaymentsState,
  paymentsReducer,
  selectConfirmedPayments,
  type PaymentsAction,
  type PaymentsState,
} from "@/lib/payments/store";

interface PaymentsContextValue {
  payments: PaymentsState;
  dispatch: (action: PaymentsAction) => void;
  /**
   * Clears the browser-local ledger only.
   *
   * It does NOT reverse, cancel, or delete any on-chain transaction.
   */
  clearLocalHistory: () => void;
  persistence: PersistenceDescriptor;
}

const PaymentsContext = createContext<PaymentsContextValue | null>(null);

const repository = getPaymentRepository();

export function PaymentsProvider({ children }: { children: ReactNode }) {
  const [payments, dispatch] = useReducer(paymentsReducer, initialPaymentsState);
  const hydratedRef = useRef(false);

  // Persistence + hydration are external-system synchronisation, which is what
  // effects are for: read storage once on mount, then mirror confirmed entries
  // back through the repository.
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      dispatch({ type: "payment/hydrated", records: repository.load() });
    }

    const confirmed = selectConfirmedPayments(payments);
    if (confirmed.length > 0) {
      repository.saveMany(confirmed);
    }
  }, [payments]);

  const clearLocalHistory = useCallback(() => {
    repository.clear();
    hydratedRef.current = true;
    dispatch({ type: "payments/reset" });
  }, []);

  const value = useMemo<PaymentsContextValue>(
    () => ({
      payments,
      dispatch,
      clearLocalHistory,
      persistence: repository.persistence,
    }),
    [payments, clearLocalHistory],
  );

  return <PaymentsContext.Provider value={value}>{children}</PaymentsContext.Provider>;
}

export function usePayments(): PaymentsContextValue {
  const context = useContext(PaymentsContext);
  if (!context) {
    throw new Error("usePayments must be used within a PaymentsProvider.");
  }
  return context;
}
