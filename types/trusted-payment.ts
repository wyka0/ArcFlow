import type { Currency, EvmAddress, TokenAmount, TransactionHash } from "./money";

/**
 * A payment that has been independently verified against Arc by the server.
 *
 * This is the authoritative record. It exists only after `verifyUsdcPayment`
 * matched a real successful receipt, the configured USDC contract, a Transfer
 * event, and the exact expected sender / recipient / amount.
 */
export interface TrustedPayment {
  id: string;
  txHash: TransactionHash;
  chainId: number;
  tokenAddress: EvmAddress;
  agentId: string;
  serviceId: string;
  serviceName: string;
  /** The on-chain `Transfer.from`, determined from the chain — not the client. */
  sender: EvmAddress;
  /** The on-chain `Transfer.to`, checked against configured expectations. */
  recipient: EvmAddress;
  amount: TokenAmount;
  currency: Currency;
  /** Exact amount in token base units (USDC = 6 decimals), as a decimal string. */
  amountBaseUnits: string;
  status: "confirmed";
  /** Block number as a decimal string so the record is JSON-safe. */
  blockNumber: string;
  confirmedAt: string;
  createdAt: string;
  /**
   * The authenticated wallet that owns this payment.
   *
   * Inherited from the verified intent. `null` for the demo flow.
   */
  ownerWalletAddress: EvmAddress | null;
  /**
   * The intent ID that this payment was verified for.
   * Allows looking up payments by the original intent.
   */
  intentId: string | null;
}

/**
 * A server-created, approved payment intent.
 *
 * The client may reference an intent id, but the expected agent, service,
 * recipient, amount, chain, and token are all fixed by the server. A client
 * cannot redefine what the payment was supposed to be.
 */
export interface PaymentIntent {
  id: string;
  agentId: string;
  serviceId: string;
  serviceName: string;
  /** The connected wallet address supplied at intent time. */
  sender: EvmAddress | null;
  recipient: EvmAddress;
  amount: TokenAmount;
  amountBaseUnits: string;
  currency: Currency;
  chainId: number;
  tokenAddress: EvmAddress;
  status: "pending" | "consumed";
  txHash: TransactionHash | null;
  createdAt: string;
  expiresAt: string;
  /**
   * The authenticated wallet that owns this intent.
   *
   * `null` for the demo flow (anonymous, single-user). Set to the
   * authenticated session's wallet when the request was authenticated; the
   * server then enforces that the same wallet is the only one allowed to
   * verify the intent and consume it.
   */
  ownerWalletAddress: EvmAddress | null;
}
