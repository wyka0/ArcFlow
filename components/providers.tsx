"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/components/auth-provider";
import { PaymentFlowProvider } from "@/components/payment-flow-provider";
import { PaymentsProvider } from "@/components/payments-provider";
import { TrustedLedgerProvider } from "@/components/trusted-ledger-provider";
import { WalletProvider } from "@/components/wallet-provider";

/**
 * Shared providers required by the app shell on every route (wallet connection
 * and authentication). These are mounted by the root layout and by the nested
 * app/activity layouts.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <AuthProvider>{children}</AuthProvider>
    </WalletProvider>
  );
}

/**
 * AgentPay-only providers. Mounted only around the routes that use them, so the
 * ArcFlow flow pages no longer mount the trusted ledger (whose mount effect
 * performs an unauthenticated `/api/payments/history` request).
 *
 * Nesting order is preserved: TrustedLedger → Payments → PaymentFlow.
 */
export function AgentPayProviders({ children }: { children: ReactNode }) {
  return (
    <TrustedLedgerProvider>
      <PaymentsProvider>
        <PaymentFlowProvider>{children}</PaymentFlowProvider>
      </PaymentsProvider>
    </TrustedLedgerProvider>
  );
}
