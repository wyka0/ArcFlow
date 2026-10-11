import type { Currency, EvmAddress, TransactionHash } from "./money";

export type PaymentStatus = "pending" | "approved" | "submitted" | "confirmed" | "failed";

export interface Payment {
  id: string;
  agentId: string;
  serviceId: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  transactionHash?: TransactionHash;
  createdAt: string;
}

/**
 * A payment that is safe to persist as settled history.
 *
 * This is intentionally narrower than `Payment`: `status` is pinned to
 * `"confirmed"` and `txHash` is required, so a record without a real Arc
 * transaction hash cannot satisfy the type.
 */
export interface ConfirmedPayment {
  id: string;
  agentId: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  currency: Currency;
  recipient: EvmAddress;
  chainId: number;
  status: "confirmed";
  txHash: TransactionHash;
  createdAt: string;
}
