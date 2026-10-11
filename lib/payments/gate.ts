import { selectService } from "@/lib/agent/decision";
import {
  buildSpendingSummary,
  evaluatePolicy,
  type AccountingPayment,
  type PolicyViolation,
  type SpendingSummary,
} from "@/lib/agent/policy";
import type { PaymentRequest, Service, SpendingPolicy } from "@/types";

import { createPaymentId } from "./id";
import { resolveServiceRecipient, type RecipientResolution } from "./recipients";

/**
 * The policy gate.
 *
 * This is the ONLY function that converts a service into an approved
 * `PaymentRequest`. Nothing else in the app may construct one, so the wallet
 * cannot be reached from service selection without passing through here.
 *
 * Daily-limit evaluation consumes CONFIRMED on-chain history (the canonical
 * ledger), never a UI-local copy.
 */
export type PaymentGateResult =
  | { status: "ready"; request: PaymentRequest; agentReason: string; spending: SpendingSummary }
  | {
      status: "blocked";
      kind: "policy" | "recipient";
      serviceId: string;
      reason: string;
      violations: readonly PolicyViolation[];
      spending: SpendingSummary;
    };

export interface PaymentGateInput {
  service: Service;
  policy: SpendingPolicy;
  /**
   * Canonical confirmed history used for daily spend accounting.
   *
   * On the server this is the trusted ledger; the client cache is never passed
   * as authoritative. The gate itself stays storage-agnostic.
   */
  confirmedHistory: readonly AccountingPayment[];
  now?: Date;
  id?: string;
  /** Test seam only. Defaults to the environment-backed demo recipients. */
  resolveRecipient?: (serviceId: string) => RecipientResolution;
}

export function evaluatePaymentGate(input: PaymentGateInput): PaymentGateResult {
  const { service, policy, confirmedHistory, now = new Date() } = input;

  const spending = buildSpendingSummary(policy, confirmedHistory, now);

  const decision = evaluatePolicy({
    policy,
    service,
    amount: service.price,
    spentToday: spending.spentToday,
  });

  if (!decision.allowed) {
    return {
      status: "blocked",
      kind: "policy",
      serviceId: service.id,
      reason: decision.violations[0]?.message ?? "The spending policy rejected this payment.",
      violations: decision.violations,
      spending,
    };
  }

  const resolveRecipient = input.resolveRecipient ?? resolveServiceRecipient;
  const recipient = resolveRecipient(service.id);
  if (!recipient.address) {
    return {
      status: "blocked",
      kind: "recipient",
      serviceId: service.id,
      reason: "Payment recipient not configured.",
      violations: [],
      spending,
    };
  }

  const agentSelection = selectService(service.name, [service]);

  return {
    status: "ready",
    agentReason:
      agentSelection?.reason ?? "The user selected this service directly from the registry.",
    request: {
      id: input.id ?? createPaymentId(),
      agentId: policy.agentId,
      serviceId: service.id,
      recipient: recipient.address,
      amount: { amount: service.price, currency: service.currency },
      currency: service.currency,
    },
    spending,
  };
}
