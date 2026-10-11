import { describe, expect, it } from "vitest";

import { evaluatePaymentGate } from "@/lib/payments/gate";
import type { RecipientResolution } from "@/lib/payments/recipients";
import type { ConfirmedPayment, Service, SpendingPolicy } from "@/types";

const POLICY: SpendingPolicy = {
  id: "policy_research_01",
  agentId: "agent_research_01",
  maxPerTransaction: 1,
  dailyLimit: 5,
  currency: "USDC",
  allowedCategories: ["research", "data", "ai"],
};

const SERVICE: Service = {
  id: "market-data",
  name: "Market Data",
  category: "data",
  price: 0.1,
  currency: "USDC",
  active: true,
  description: "Market data service",
};

const CONFIGURED = (serviceId: string): RecipientResolution => ({
  serviceId,
  address: "0x1234567890abcdef1234567890abcdef12345678",
  isDemo: true,
});

const UNCONFIGURED = (serviceId: string): RecipientResolution => ({
  serviceId,
  address: null,
  isDemo: true,
});

function confirmed(amount: number, createdAt = new Date().toISOString()): ConfirmedPayment {
  return {
    id: `pay_${amount}_${createdAt}`,
    agentId: "agent_research_01",
    serviceId: "market-data",
    serviceName: "Market Data",
    amount,
    currency: "USDC",
    recipient: "0x1234567890abcdef1234567890abcdef12345678",
    chainId: 5042,
    status: "confirmed",
    txHash: `0x${"b".repeat(64)}`,
    createdAt,
  };
}

function gate(overrides: {
  service?: Service;
  policy?: SpendingPolicy;
  confirmedHistory?: readonly ConfirmedPayment[];
  resolveRecipient?: (serviceId: string) => RecipientResolution;
} = {}) {
  return evaluatePaymentGate({
    service: overrides.service ?? SERVICE,
    policy: overrides.policy ?? POLICY,
    confirmedHistory: overrides.confirmedHistory ?? [],
    resolveRecipient: overrides.resolveRecipient ?? CONFIGURED,
    id: "pay_test",
  });
}

describe("payment gate", () => {
  it("produces an approved PaymentRequest for a valid selection", () => {
    const result = gate();
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.request.serviceId).toBe("market-data");
      expect(result.request.currency).toBe("USDC");
      expect(result.request.amount).toEqual({ amount: 0.1, currency: "USDC" });
      expect(result.request.recipient).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(result.agentReason.length).toBeGreaterThan(0);
      expect(result.spending).toEqual({
        currency: "USDC",
        dailyLimit: 5,
        spentToday: 0,
        remainingToday: 5,
        zone: "local",
      });
    }
  });

  it("blocks an inactive service", () => {
    const result = gate({ service: { ...SERVICE, active: false } });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.kind).toBe("policy");
      expect(result.violations.map((v) => v.code)).toContain("SERVICE_INACTIVE");
    }
  });

  it("blocks a disallowed category", () => {
    const result = gate({ policy: { ...POLICY, allowedCategories: ["research"] } });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.violations.map((v) => v.code)).toContain("CATEGORY_NOT_ALLOWED");
    }
  });

  it("blocks a wrong currency", () => {
    const result = gate({ service: { ...SERVICE, currency: "EURC" as Service["currency"] } });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.violations.map((v) => v.code)).toContain("CURRENCY_MISMATCH");
    }
  });

  it("blocks an amount above the per-transaction limit", () => {
    const result = gate({ service: { ...SERVICE, price: 2 } });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.violations.map((v) => v.code)).toContain("EXCEEDS_MAX_PER_TRANSACTION");
    }
  });

  it("blocks when the daily limit would be exceeded by confirmed history", () => {
    const result = gate({ confirmedHistory: [confirmed(4.95)] });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.violations.map((v) => v.code)).toContain("EXCEEDS_DAILY_LIMIT");
      expect(result.spending.spentToday).toBe(4.95);
    }
  });

  it("approves exactly at the daily limit", () => {
    const result = gate({ confirmedHistory: [confirmed(4.9)] });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.spending.spentToday).toBe(4.9);
      expect(result.spending.remainingToday).toBe(0.1);
    }
  });

  it("blocks when no recipient is configured", () => {
    const result = gate({ resolveRecipient: UNCONFIGURED });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.kind).toBe("recipient");
      expect(result.reason).toBe("Payment recipient not configured.");
      expect(result.violations).toHaveLength(0);
    }
  });

  it("checks policy before recipient, so policy wins the reason", () => {
    const result = gate({
      service: { ...SERVICE, active: false },
      resolveRecipient: UNCONFIGURED,
    });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") expect(result.kind).toBe("policy");
  });
});
