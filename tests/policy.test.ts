import { describe, expect, it } from "vitest";

import { evaluatePolicy } from "@/lib/agent/policy";
import type { Service, SpendingPolicy } from "@/types";

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

function evaluate(overrides: Partial<{ service: Service; amount: number; spentToday: number }> = {}) {
  return evaluatePolicy({
    policy: POLICY,
    service: overrides.service ?? SERVICE,
    amount: overrides.amount ?? SERVICE.price,
    spentToday: overrides.spentToday ?? 0,
  });
}

describe("policy engine", () => {
  it("approves a valid request", () => {
    expect(evaluate()).toEqual({ allowed: true, violations: [] });
  });

  it("rejects an inactive service", () => {
    const decision = evaluate({ service: { ...SERVICE, active: false } });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.violations.map((v) => v.code)).toContain("SERVICE_INACTIVE");
    }
  });

  it("rejects a disallowed category", () => {
    const decision = evaluatePolicy({
      policy: { ...POLICY, allowedCategories: ["research"] },
      service: SERVICE,
      amount: SERVICE.price,
      spentToday: 0,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.violations.map((v) => v.code)).toContain("CATEGORY_NOT_ALLOWED");
    }
  });

  it("rejects a wrong currency", () => {
    const foreign = evaluatePolicy({
      policy: POLICY,
      service: { ...SERVICE, currency: "EURC" as Service["currency"] },
      amount: SERVICE.price,
      spentToday: 0,
    });
    expect(foreign.allowed).toBe(false);
    if (!foreign.allowed) {
      expect(foreign.violations.map((v) => v.code)).toContain("CURRENCY_MISMATCH");
    }
  });

  it("rejects an amount above the per-transaction limit", () => {
    const decision = evaluate({ amount: 1.01 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.violations.map((v) => v.code)).toContain("EXCEEDS_MAX_PER_TRANSACTION");
    }
  });

  it("approves when daily budget is available", () => {
    expect(evaluate({ spentToday: 4.5 })).toEqual({ allowed: true, violations: [] });
  });

  it("approves exactly at the daily limit", () => {
    expect(evaluate({ amount: 0.1, spentToday: 4.9 })).toEqual({ allowed: true, violations: [] });
  });

  it("blocks one cent over the daily limit", () => {
    const decision = evaluate({ amount: 0.1, spentToday: 4.91 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.violations.map((v) => v.code)).toContain("EXCEEDS_DAILY_LIMIT");
    }
  });

  it("blocks a request that exceeds the daily limit", () => {
    const decision = evaluate({ spentToday: 4.95 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.violations.map((v) => v.code)).toContain("EXCEEDS_DAILY_LIMIT");
    }
  });

  it("approves exactly at both limits", () => {
    expect(evaluate({ amount: 1, spentToday: 4 })).toEqual({ allowed: true, violations: [] });
  });
});
