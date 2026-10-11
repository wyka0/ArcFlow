"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/components/auth-provider";
import { PaymentFlowProvider } from "@/components/payment-flow-provider";
import { PaymentsProvider } from "@/components/payments-provider";
import { TrustedLedgerProvider } from "@/components/trusted-ledger-provider";
import { WalletProvider } from "@/components/wallet-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <AuthProvider>
        <TrustedLedgerProvider>
          <PaymentsProvider>
            <PaymentFlowProvider>{children}</PaymentFlowProvider>
          </PaymentsProvider>
        </TrustedLedgerProvider>
      </AuthProvider>
    </WalletProvider>
  );
}
