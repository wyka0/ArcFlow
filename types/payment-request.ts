import type { Currency, EvmAddress, TokenAmount } from "./money";

/**
 * An approved, payable request.
 *
 * A `PaymentRequest` may only be produced by the policy gate
 * (`lib/payments/gate.ts`), which is the single authority that turns a service
 * selection into something the wallet is allowed to send.
 */
export interface PaymentRequest {
  id: string;
  agentId: string;
  serviceId: string;
  recipient: EvmAddress;
  amount: TokenAmount;
  currency: Currency;
}
