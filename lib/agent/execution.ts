import type { Service } from "@/types";
import type { TrustedPayment } from "@/types";

/**
 * Agent execution contract — the typed boundary between agent decision and server authority.
 *
 * The agent is a CLIENT of the trusted server. It never calculates authorization.
 */

// ═══════════════════════════════════════════════════════════════════
// AGENT DECISION
// ═══════════════════════════════════════════════════════════════════

export interface AgentDecisionInput {
  agentId: string;
  serviceId: string;
  /** Wallet address from the connected provider (optional for intent creation). */
  sender: `0x${string}` | null;
}

export interface AgentDecisionResult {
  /** The chosen service. */
  service: Service;
  /** Why this service was selected. */
  reason: string;
}

/**
 * Pure agent decision logic — selects a service based on explicit criteria.
 * Does NOT evaluate policy or spending limits. That is the server's job.
 */
export function makeAgentDecision(
  input: AgentDecisionInput,
  availableServices: readonly Service[],
): AgentDecisionResult | { status: "no-match"; reason: string } {
  const service = availableServices.find((s) => s.id === input.serviceId && s.active);
  if (!service) {
    return { status: "no-match", reason: `Service "${input.serviceId}" not found or inactive.` };
  }
  return {
    service,
    reason: `Agent selected ${service.name} (${service.category}) for ${service.price} ${service.currency}.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PAYMENT INTENT — IMMUTABLE AFTER SERVER APPROVAL
// ═══════════════════════════════════════════════════════════════════

/**
 * Approved payment intent — these values are fixed by the server and MUST NOT
 * be modified by the agent or execution layer.
 */
export interface ApprovedPaymentIntent {
  readonly id: string;
  readonly agentId: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly recipient: `0x${string}`;
  readonly amount: { readonly amount: number; readonly currency: "USDC" };
  readonly amountBaseUnits: string;
  readonly currency: "USDC";
  readonly chainId: number;
  readonly tokenAddress: `0x${string}`;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/**
 * Creates an execution-ready payment request from an approved intent.
 * The execution layer MUST use these exact values — no modifications allowed.
 */
export function intentToExecutionRequest(
  intent: ApprovedPaymentIntent,
): {
  readonly id: string;
  readonly agentId: string;
  readonly serviceId: string;
  readonly recipient: `0x${string}`;
  readonly amount: { readonly amount: number; readonly currency: "USDC" };
  readonly currency: "USDC";
} {
  return {
    id: intent.id,
    agentId: intent.agentId,
    serviceId: intent.serviceId,
    recipient: intent.recipient,
    amount: intent.amount,
    currency: intent.currency,
  };
}

/**
 * Verifies that an execution request matches the approved intent exactly.
 * Rejects any tampering attempt.
 */
export function verifyIntentIntegrity(
  intent: ApprovedPaymentIntent,
  executionRequest: {
    id?: string;
    agentId?: string;
    serviceId?: string;
    recipient?: `0x${string}`;
    amount?: { amount: number; currency: string };
    currency?: string;
  },
): { ok: true } | { ok: false; code: string; message: string } {
  if (executionRequest.id !== undefined && executionRequest.id !== intent.id) {
    return { ok: false, code: "INTENT_ID_MISMATCH", message: "Intent ID does not match." };
  }
  if (executionRequest.agentId !== undefined && executionRequest.agentId !== intent.agentId) {
    return { ok: false, code: "AGENT_ID_MISMATCH", message: "Agent ID does not match." };
  }
  if (executionRequest.serviceId !== undefined && executionRequest.serviceId !== intent.serviceId) {
    return { ok: false, code: "SERVICE_ID_MISMATCH", message: "Service ID does not match." };
  }
  if (executionRequest.recipient !== undefined && executionRequest.recipient !== intent.recipient) {
    return { ok: false, code: "RECIPIENT_MISMATCH", message: "Recipient does not match." };
  }
  if (executionRequest.amount !== undefined) {
    if (executionRequest.amount.amount !== intent.amount.amount) {
      return { ok: false, code: "AMOUNT_MISMATCH", message: "Amount does not match." };
    }
    if (executionRequest.amount.currency !== intent.amount.currency) {
      return { ok: false, code: "CURRENCY_MISMATCH", message: "Currency does not match." };
    }
  }
  if (executionRequest.currency !== undefined && executionRequest.currency !== intent.currency) {
    return { ok: false, code: "CURRENCY_MISMATCH", message: "Currency does not match." };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════
// EXECUTION STATE MACHINE
// ═══════════════════════════════════════════════════════════════════

export type AgentExecutionPhase =
  | "idle"
  | "requesting_intent"
  | "intent_approved"
  | "intent_rejected"
  | "awaiting_signature"
  | "submitted"
  | "verification_pending"
  | "confirmed"
  | "failed";

export interface AgentExecutionState {
  readonly phase: AgentExecutionPhase;
  readonly intentId: string | null;
  readonly serviceId: string | null;
  readonly serviceName: string | null;
  readonly approvedIntent: ApprovedPaymentIntent | null;
  readonly transactionHash: `0x${string}` | null;
  readonly failureReason: string | null;
  readonly error: string | null;
  readonly updatedAt: string | null;
}

export const initialAgentExecutionState: AgentExecutionState = {
  phase: "idle",
  intentId: null,
  serviceId: null,
  serviceName: null,
  approvedIntent: null,
  transactionHash: null,
  failureReason: null,
  error: null,
  updatedAt: null,
};

export type AgentExecutionAction =
  | { type: "execution/start"; serviceId: string }
  | { type: "execution/intent_approved"; intent: ApprovedPaymentIntent }
  | { type: "execution/intent_rejected"; reason: string; code: string }
  | { type: "execution/submit"; transactionHash: `0x${string}` }
  | { type: "execution/verify_start" }
  | { type: "execution/confirmed"; record: TrustedPayment }
  | { type: "execution/failed"; reason: string; failureReason?: string }
  | { type: "execution/reset" };

export type AgentDispatch = React.Dispatch<AgentExecutionAction>;

export function agentExecutionReducer(
  state: AgentExecutionState,
  action: AgentExecutionAction,
): AgentExecutionState {
  const now = new Date().toISOString();

  switch (action.type) {
    case "execution/start": {
      return {
        ...state,
        phase: "requesting_intent",
        serviceId: action.serviceId,
        intentId: null,
        serviceName: null,
        approvedIntent: null,
        transactionHash: null,
        failureReason: null,
        error: null,
        updatedAt: now,
      };
    }

    case "execution/intent_approved": {
      return {
        ...state,
        phase: "intent_approved",
        intentId: action.intent.id,
        serviceName: action.intent.serviceName,
        approvedIntent: action.intent,
        error: null,
        updatedAt: now,
      };
    }

    case "execution/intent_rejected": {
      return {
        ...state,
        phase: "intent_rejected",
        error: `${action.code}: ${action.reason}`,
        failureReason: action.reason,
        updatedAt: now,
      };
    }

    case "execution/submit": {
      if (state.phase !== "awaiting_signature" && state.phase !== "intent_approved") {
        return state;
      }
      return {
        ...state,
        phase: "verification_pending",
        transactionHash: action.transactionHash,
        updatedAt: now,
      };
    }

    case "execution/verify_start": {
      if (state.phase !== "verification_pending") return state;
      return { ...state, updatedAt: now };
    }

    case "execution/confirmed": {
      return {
        ...state,
        phase: "confirmed",
        failureReason: null,
        error: null,
        updatedAt: now,
      };
    }

    case "execution/failed": {
      return {
        ...state,
        phase: "failed",
        failureReason: action.failureReason ?? action.reason,
        error: action.reason,
        updatedAt: now,
      };
    }

    case "execution/reset": {
      return initialAgentExecutionState;
    }

    default:
      return state;
  }
}

export function canTransitionExecution(from: AgentExecutionPhase, to: AgentExecutionPhase): boolean {
  const transitions: Record<AgentExecutionPhase, readonly AgentExecutionPhase[]> = {
    idle: ["requesting_intent"],
    requesting_intent: ["intent_approved", "intent_rejected"],
    intent_approved: ["awaiting_signature"],
    intent_rejected: ["idle", "requesting_intent"],
    awaiting_signature: ["verification_pending", "failed"],
    submitted: ["verification_pending", "failed"],
    verification_pending: ["confirmed", "failed"],
    confirmed: ["idle"],
    failed: ["idle", "requesting_intent"],
  };
  return transitions[from]?.includes(to) ?? false;
}

// ═══════════════════════════════════════════════════════════════════
// VERIFICATION LOOP
// ═══════════════════════════════════════════════════════════════════

import { verifyTrustedTransaction } from "@/lib/payments/client";

export type VerificationResult =
  | {
      ok: true;
      record: TrustedPayment;
      alreadyRecorded: boolean;
      spending: {
        currency: "USDC";
        dailyLimit: number;
        spentToday: number;
        remainingToday: number;
        zone: "utc" | "local";
      };
    }
  | { ok: false; code: string; message: string };

/**
 * Verifies a submitted transaction against the trusted server ledger.
 * Only the server verification can confirm a payment.
 */
export async function verifyExecution(
  intentId: string,
  txHash: `0x${string}`,
): Promise<VerificationResult> {
  const result = await verifyTrustedTransaction({ intentId, txHash });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
    };
  }

  return {
    ok: true,
    record: result.data.record,
    alreadyRecorded: result.data.alreadyRecorded,
    spending: result.data.spending,
  };
}