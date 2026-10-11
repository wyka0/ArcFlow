import { describe, expect, it } from "vitest";

import {
  makeAgentDecision,
  verifyIntentIntegrity,
  intentToExecutionRequest,
  initialAgentExecutionState,
  agentExecutionReducer,
  canTransitionExecution,
} from "@/lib/agent/execution";
import type { Service, TrustedPayment } from "@/types";

const DEMO_SERVICES: readonly Service[] = [
  { id: "market-data", name: "Market Data", category: "data", price: 0.1, currency: "USDC", active: true, description: "Market data service" },
  { id: "research-report", name: "Research Report", category: "research", price: 0.25, currency: "USDC", active: true, description: "Research report service" },
  { id: "ai-summary", name: "AI Summary", category: "ai", price: 0.05, currency: "USDC", active: true, description: "AI summary service" },
];

function createApprovedIntent(overrides: Partial<{ id: string; recipient: string; amount: number; serviceId: string }> = {}) {
  return {
    id: overrides.id ?? "intent_1",
    agentId: "agent_research_01",
    serviceId: overrides.serviceId ?? "market-data",
    serviceName: "Market Data",
    recipient: (overrides.recipient ?? "0x1234567890abcdef1234567890abcdef12345678") as `0x${string}`,
    amount: { amount: overrides.amount ?? 0.1, currency: "USDC" as const },
    amountBaseUnits: "100000",
    currency: "USDC" as const,
    chainId: 5042,
    tokenAddress: "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`,
    createdAt: "2026-09-21T10:00:00.000Z",
    expiresAt: "2026-09-21T10:30:00.000Z",
  };
}

describe("Agent Decision", () => {
  it("selects a valid active service by id", () => {
    const result = makeAgentDecision(
      { agentId: "agent_1", serviceId: "market-data", sender: null },
      DEMO_SERVICES,
    );
    expect("service" in result).toBe(true);
    if ("service" in result) {
      expect(result.service.id).toBe("market-data");
      expect(result.reason).toContain("Market Data");
    }
  });

  it("rejects unknown service", () => {
    const result = makeAgentDecision(
      { agentId: "agent_1", serviceId: "unknown-service", sender: null },
      DEMO_SERVICES,
    );
    expect("status" in result && result.status === "no-match").toBe(true);
  });

  it("rejects inactive service", () => {
    const services = DEMO_SERVICES.map((s) => (s.id === "market-data" ? { ...s, active: false } : s));
    const result = makeAgentDecision(
      { agentId: "agent_1", serviceId: "market-data", sender: null },
      services,
    );
    expect("status" in result && result.status === "no-match").toBe(true);
  });
});

describe("PaymentIntent Integrity", () => {
  const intent = createApprovedIntent();

  it("accepts exact match", () => {
    const result = verifyIntentIntegrity(intent, {});
    expect(result.ok).toBe(true);
  });

  it("rejects tampered amount", () => {
    const result = verifyIntentIntegrity(intent, { amount: { amount: 0.2, currency: "USDC" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AMOUNT_MISMATCH");
  });

  it("rejects tampered recipient", () => {
    const result = verifyIntentIntegrity(intent, { recipient: "0x0000000000000000000000000000000000000000" as `0x${string}` });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RECIPIENT_MISMATCH");
  });

  it("rejects tampered serviceId", () => {
    const result = verifyIntentIntegrity(intent, { serviceId: "research-report" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SERVICE_ID_MISMATCH");
  });

  it("rejects tampered agentId", () => {
    const result = verifyIntentIntegrity(intent, { agentId: "agent_999" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AGENT_ID_MISMATCH");
  });

  it("rejects tampered currency", () => {
    const result = verifyIntentIntegrity(intent, { currency: "EURC" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CURRENCY_MISMATCH");
  });

  it("rejects tampered intent id", () => {
    const result = verifyIntentIntegrity(intent, { id: "intent_999" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INTENT_ID_MISMATCH");
  });
});

describe("Intent to Execution Request", () => {
  const intent = createApprovedIntent();

  it("produces exact execution request", () => {
    const req = intentToExecutionRequest(intent);
    expect(req.id).toBe(intent.id);
    expect(req.agentId).toBe(intent.agentId);
    expect(req.serviceId).toBe(intent.serviceId);
    expect(req.recipient).toBe(intent.recipient);
    expect(req.amount.amount).toBe(intent.amount.amount);
    expect(req.amount.currency).toBe(intent.amount.currency);
    expect(req.currency).toBe(intent.currency);
  });
});

describe("Agent Execution State Machine", () => {
  it("starts in idle", () => {
    expect(initialAgentExecutionState.phase).toBe("idle");
  });

  it("idle -> requesting_intent", () => {
    const state = agentExecutionReducer(initialAgentExecutionState, { type: "execution/start", serviceId: "market-data" });
    expect(state.phase).toBe("requesting_intent");
    expect(state.serviceId).toBe("market-data");
  });

  it("requesting_intent -> intent_approved", () => {
    const requesting = agentExecutionReducer(initialAgentExecutionState, { type: "execution/start", serviceId: "market-data" });
    const intent = createApprovedIntent();
    const state = agentExecutionReducer(requesting, { type: "execution/intent_approved", intent });
    expect(state.phase).toBe("intent_approved");
    expect(state.approvedIntent).toEqual(intent);
  });

  it("requesting_intent -> intent_rejected", () => {
    const requesting = agentExecutionReducer(initialAgentExecutionState, { type: "execution/start", serviceId: "market-data" });
    const state = agentExecutionReducer(requesting, { type: "execution/intent_rejected", reason: "Policy blocked", code: "POLICY_BLOCKED" });
    expect(state.phase).toBe("intent_rejected");
    expect(state.error).toContain("POLICY_BLOCKED");
  });

  it("intent_approved -> awaiting_signature (via submit)", () => {
    const requesting = agentExecutionReducer(initialAgentExecutionState, { type: "execution/start", serviceId: "market-data" });
    const intent = createApprovedIntent();
    const approved = agentExecutionReducer(requesting, { type: "execution/intent_approved", intent });
    const state = agentExecutionReducer(approved, { type: "execution/submit", transactionHash: `0x${"a".repeat(64)}` });
    expect(state.phase).toBe("verification_pending");
    expect(state.transactionHash).toBe(`0x${"a".repeat(64)}`);
  });

  it("verification_pending -> confirmed", () => {
    const requesting = agentExecutionReducer(initialAgentExecutionState, { type: "execution/start", serviceId: "market-data" });
    const intent = createApprovedIntent();
    const approved = agentExecutionReducer(requesting, { type: "execution/intent_approved", intent });
    const submitted = agentExecutionReducer(approved, { type: "execution/submit", transactionHash: `0x${"a".repeat(64)}` });
    const state = agentExecutionReducer(submitted, { type: "execution/confirmed", record: {} as TrustedPayment });
    expect(state.phase).toBe("confirmed");
  });

  it("verification_pending -> failed", () => {
    const requesting = agentExecutionReducer(initialAgentExecutionState, { type: "execution/start", serviceId: "market-data" });
    const intent = createApprovedIntent();
    const approved = agentExecutionReducer(requesting, { type: "execution/intent_approved", intent });
    const submitted = agentExecutionReducer(approved, { type: "execution/submit", transactionHash: `0x${"a".repeat(64)}` });
    const state = agentExecutionReducer(submitted, { type: "execution/failed", reason: "Verification failed" });
    expect(state.phase).toBe("failed");
  });

  it("confirmed -> idle via reset", () => {
    const requesting = agentExecutionReducer(initialAgentExecutionState, { type: "execution/start", serviceId: "market-data" });
    const intent = createApprovedIntent();
    const approved = agentExecutionReducer(requesting, { type: "execution/intent_approved", intent });
    const submitted = agentExecutionReducer(approved, { type: "execution/submit", transactionHash: `0x${"a".repeat(64)}` });
    const confirmed = agentExecutionReducer(submitted, { type: "execution/confirmed", record: {} as TrustedPayment });
    const state = agentExecutionReducer(confirmed, { type: "execution/reset" });
    expect(state.phase).toBe("idle");
    expect(state.intentId).toBeNull();
  });

  it("blocks invalid transitions", () => {
    // Cannot submit from idle
    const state = agentExecutionReducer(initialAgentExecutionState, { type: "execution/submit", transactionHash: `0x${"a".repeat(64)}` });
    expect(state.phase).toBe("idle");
  });

  it("enforces transition graph", () => {
    expect(canTransitionExecution("idle", "requesting_intent")).toBe(true);
    expect(canTransitionExecution("requesting_intent", "intent_approved")).toBe(true);
    expect(canTransitionExecution("requesting_intent", "intent_rejected")).toBe(true);
    expect(canTransitionExecution("intent_approved", "awaiting_signature")).toBe(true); // Note: submit goes to verification_pending
    expect(canTransitionExecution("awaiting_signature", "verification_pending")).toBe(true);
    expect(canTransitionExecution("verification_pending", "confirmed")).toBe(true);
    expect(canTransitionExecution("verification_pending", "failed")).toBe(true);
    expect(canTransitionExecution("confirmed", "idle")).toBe(true);
    expect(canTransitionExecution("failed", "idle")).toBe(true);
    expect(canTransitionExecution("idle", "confirmed")).toBe(false);
    expect(canTransitionExecution("failed", "confirmed")).toBe(false);
  });
});