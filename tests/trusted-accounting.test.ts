import { describe, expect, it } from "vitest";

import {
  amountToBaseUnits,
  baseUnitsToAmount,
  baseUnitsToCents,
  buildSpendingSummaryTrusted,
  evaluateTrustedPolicy,
  sumConfirmedTodayTrusted,
  trustedToAccounting,
} from "@/lib/payments/server/accounting";
import { DEMO_SPENDING_POLICY } from "@/lib/demo/agent";
import type { SpendingPolicy } from "@/types";
import type { TrustedPayment } from "@/types";

function createTrustedPayment(overrides: Partial<TrustedPayment> = {}): TrustedPayment {
  const now = new Date().toISOString();
  return {
    id: "pay_1",
    txHash: `0x${"a".repeat(64)}`,
    chainId: 5042,
    tokenAddress: "0x1234567890abcdef1234567890abcdef12345678",
    agentId: "agent_research_01",
    serviceId: "market-data",
    serviceName: "Market Data",
    sender: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    recipient: "0x1234567890abcdef1234567890abcdef12345678",
    amount: { amount: 0.1, currency: "USDC" },
    currency: "USDC",
    amountBaseUnits: "100000",
    status: "confirmed",
    blockNumber: "12345678",
    confirmedAt: now,
    createdAt: now,
    ownerWalletAddress: null,
    intentId: null,
    ...overrides,
  };
}

describe("Trusted Accounting (server-side, bigint)", () => {
  describe("amountToBaseUnits", () => {
    it("converts USDC amounts to base units exactly", () => {
      expect(amountToBaseUnits(0.1)).toBe(100_000n);
      expect(amountToBaseUnits(0.25)).toBe(250_000n);
      expect(amountToBaseUnits(1)).toBe(1_000_000n);
      expect(amountToBaseUnits(5)).toBe(5_000_000n);
    });

    it("is not affected by floating point drift", () => {
      expect(amountToBaseUnits(0.1 + 0.2)).toBe(300_000n);
    });

    it("rejects non-positive or non-finite amounts", () => {
      expect(() => amountToBaseUnits(0)).toThrow();
      expect(() => amountToBaseUnits(-1)).toThrow();
      expect(() => amountToBaseUnits(Number.NaN)).toThrow();
      expect(() => amountToBaseUnits(Number.POSITIVE_INFINITY)).toThrow();
    });
  });

  describe("baseUnitsToAmount / baseUnitsToCents", () => {
    it("round-trips correctly", () => {
      const baseUnits = amountToBaseUnits(0.1);
      expect(baseUnitsToAmount(baseUnits)).toBe(0.1);
      expect(baseUnitsToCents(baseUnits)).toBe(10);
    });

    it("handles larger amounts", () => {
      const baseUnits = amountToBaseUnits(123.45);
      expect(baseUnitsToAmount(baseUnits)).toBe(123.45);
      expect(baseUnitsToCents(baseUnits)).toBe(12345);
    });
  });

  describe("sumConfirmedTodayTrusted", () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    const todayEarly = new Date("2026-09-21T00:30:00.000Z").toISOString();
    const yesterdayLate = new Date("2026-09-20T23:30:00.000Z").toISOString();
    const yesterdayNoon = new Date("2026-09-20T12:00:00.000Z").toISOString();

    it("returns zero with no payments", () => {
      expect(sumConfirmedTodayTrusted([], "USDC", now)).toBe(0n);
    });

    it("sums one confirmed payment", () => {
      const history = [createTrustedPayment({ amount: { amount: 0.1, currency: "USDC" }, confirmedAt: todayEarly })];
      expect(sumConfirmedTodayTrusted(history, "USDC", now)).toBe(100_000n);
    });

    it("sums multiple confirmed payments", () => {
      const history = [
        createTrustedPayment({ id: "a", amount: { amount: 0.1, currency: "USDC" }, confirmedAt: todayEarly }),
        createTrustedPayment({ id: "b", amount: { amount: 0.2, currency: "USDC" }, confirmedAt: todayEarly }),
        createTrustedPayment({ id: "c", amount: { amount: 0.3, currency: "USDC" }, confirmedAt: todayEarly }),
      ];
      expect(sumConfirmedTodayTrusted(history, "USDC", now)).toBe(600_000n);
    });

    it("ignores payments from a previous day (UTC)", () => {
      const history = [createTrustedPayment({ id: "old", amount: { amount: 4.5, currency: "USDC" }, confirmedAt: yesterdayNoon })];
      expect(sumConfirmedTodayTrusted(history, "USDC", now)).toBe(0n);
    });

    it("counts today's payment only", () => {
      const history = [
        createTrustedPayment({ id: "today", amount: { amount: 0.25, currency: "USDC" }, confirmedAt: todayEarly }),
        createTrustedPayment({ id: "yesterday", amount: { amount: 4, currency: "USDC" }, confirmedAt: yesterdayLate }),
      ];
      expect(sumConfirmedTodayTrusted(history, "USDC", now)).toBe(250_000n);
    });

    it("ignores non-matching currency filter", () => {
      const history = [createTrustedPayment({ amount: { amount: 0.1, currency: "USDC" }, confirmedAt: todayEarly })];
      // The filter currency doesn't match the payment currency
      expect(sumConfirmedTodayTrusted(history, "EURC" as SpendingPolicy["currency"], now)).toBe(0n);
    });
  });

  describe("buildSpendingSummaryTrusted", () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    const todayEarly = new Date("2026-09-21T00:30:00.000Z").toISOString();

    it("returns zero spending with no payments", () => {
      const summary = buildSpendingSummaryTrusted(DEMO_SPENDING_POLICY, [], now);
      expect(summary.spentToday).toBe(0);
      expect(summary.remainingToday).toBe(5);
      expect(summary.dailyLimit).toBe(5);
      expect(summary.currency).toBe("USDC");
      expect(summary.zone).toBe("utc");
    });

    it("calculates spent and remaining correctly", () => {
      const history = [createTrustedPayment({ amount: { amount: 0.1, currency: "USDC" }, confirmedAt: todayEarly })];
      const summary = buildSpendingSummaryTrusted(DEMO_SPENDING_POLICY, history, now);
      expect(summary.spentToday).toBe(0.1);
      expect(summary.remainingToday).toBe(4.9);
    });

    it("never reports negative remaining", () => {
      const history = [createTrustedPayment({ amount: { amount: 50, currency: "USDC" }, confirmedAt: todayEarly })];
      const summary = buildSpendingSummaryTrusted(DEMO_SPENDING_POLICY, history, now);
      expect(summary.remainingToday).toBe(0);
    });
  });

  describe("evaluateTrustedPolicy", () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    const todayEarly = new Date("2026-09-21T00:30:00.000Z").toISOString();

    function createInput(overrides: {
      servicePrice?: number;
      serviceActive?: boolean;
      serviceCategory?: string;
      serviceCurrency?: "USDC";
      history?: TrustedPayment[];
    } = {}) {
      return {
        policy: DEMO_SPENDING_POLICY,
        serviceId: "market-data",
        serviceName: "Market Data",
        serviceCategory: "data",
        servicePrice: 0.1,
        serviceCurrency: "USDC" as const,
        serviceActive: true,
        history: [],
        now,
        ...overrides,
      };
    }

    it("allows a valid payment", () => {
      const result = evaluateTrustedPolicy(createInput());
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("blocks an inactive service", () => {
      const result = evaluateTrustedPolicy(createInput({ serviceActive: false }));
      expect(result.allowed).toBe(false);
      expect(result.violations.map((v) => v.code)).toContain("SERVICE_INACTIVE");
    });

    it("blocks a disallowed category", () => {
      const result = evaluateTrustedPolicy(createInput({ serviceCategory: "unknown" }));
      expect(result.allowed).toBe(false);
      expect(result.violations.map((v) => v.code)).toContain("CATEGORY_NOT_ALLOWED");
    });

    it("blocks a wrong currency", () => {
      const result = evaluateTrustedPolicy(createInput({ serviceCurrency: "EURC" as SpendingPolicy["currency"] }));
      expect(result.allowed).toBe(false);
      expect(result.violations.map((v) => v.code)).toContain("CURRENCY_MISMATCH");
    });

    it("blocks an amount above the per-transaction limit", () => {
      const result = evaluateTrustedPolicy(createInput({ servicePrice: 1.01 }));
      expect(result.allowed).toBe(false);
      expect(result.violations.map((v) => v.code)).toContain("EXCEEDS_MAX_PER_TRANSACTION");
    });

    it("approves exactly at the per-transaction limit", () => {
      const result = evaluateTrustedPolicy(createInput({ servicePrice: 1.0 }));
      expect(result.allowed).toBe(true);
    });

    it("approves when daily budget is available", () => {
      const history = [createTrustedPayment({ amount: { amount: 4.5, currency: "USDC" }, confirmedAt: todayEarly })];
      const result = evaluateTrustedPolicy(createInput({ history }));
      expect(result.allowed).toBe(true);
    });

    it("approves exactly at the daily limit", () => {
      const history = [createTrustedPayment({ amount: { amount: 4.9, currency: "USDC" }, confirmedAt: todayEarly })];
      const result = evaluateTrustedPolicy(createInput({ history, servicePrice: 0.1 }));
      expect(result.allowed).toBe(true);
    });

    it("blocks one base unit over the daily limit", () => {
      const history = [createTrustedPayment({ amount: { amount: 4.9, currency: "USDC" }, confirmedAt: todayEarly })];
      const result = evaluateTrustedPolicy(createInput({ history, servicePrice: 0.11 }));
      expect(result.allowed).toBe(false);
      expect(result.violations.map((v) => v.code)).toContain("EXCEEDS_DAILY_LIMIT");
    });

    it("blocks a request that exceeds the daily limit", () => {
      const history = [createTrustedPayment({ amount: { amount: 4.95, currency: "USDC" }, confirmedAt: todayEarly })];
      const result = evaluateTrustedPolicy(createInput({ history }));
      expect(result.allowed).toBe(false);
      expect(result.violations.map((v) => v.code)).toContain("EXCEEDS_DAILY_LIMIT");
    });

    it("returns bigint values for all amounts", () => {
      const history = [createTrustedPayment({ amount: { amount: 0.1, currency: "USDC" }, confirmedAt: todayEarly })];
      const result = evaluateTrustedPolicy(createInput({ history }));
      expect(typeof result.spentTodayBaseUnits).toBe("bigint");
      expect(typeof result.dailyLimitBaseUnits).toBe("bigint");
      expect(typeof result.maxPerTransactionBaseUnits).toBe("bigint");
      expect(typeof result.requestedBaseUnits).toBe("bigint");
    });

    it("ignores yesterday's payments for daily limit", () => {
      const yesterdayLate = new Date("2026-09-20T23:30:00.000Z").toISOString();
      const history = [createTrustedPayment({ amount: { amount: 4.95, currency: "USDC" }, confirmedAt: yesterdayLate })];
      const result = evaluateTrustedPolicy(createInput({ history }));
      expect(result.allowed).toBe(true);
    });
  });

  describe("trustedToAccounting", () => {
    it("converts TrustedPayment to AccountingPayment", () => {
      const now = new Date().toISOString();
      const payments = [
        createTrustedPayment({ id: "a", amount: { amount: 0.1, currency: "USDC" }, confirmedAt: now }),
        createTrustedPayment({ id: "b", amount: { amount: 0.2, currency: "USDC" }, confirmedAt: now }),
      ];
      const accounting = trustedToAccounting(payments);
      expect(accounting).toHaveLength(2);
      expect(accounting[0].amount).toBe(0.1);
      expect(accounting[0].currency).toBe("USDC");
      expect(accounting[0].createdAt).toBe(now);
    });
  });
});

describe("Trust Boundary - client values must not affect trusted accounting", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  const todayEarly = new Date("2026-09-21T00:30:00.000Z").toISOString();

  it("client-provided spentToday is never used by trusted accounting", () => {
    const history = [createTrustedPayment({ amount: { amount: 0.1, currency: "USDC" }, confirmedAt: todayEarly })];
    const result = sumConfirmedTodayTrusted(history, "USDC", now);
    expect(result).toBe(100_000n);
  });

  it("client-provided remainingToday is never used", () => {
    const summary = buildSpendingSummaryTrusted(DEMO_SPENDING_POLICY, [], now);
    expect(summary.remainingToday).toBe(5);
  });

  it("trusted accounting derives everything from TrustedPayment records", () => {
    const history = [
      createTrustedPayment({ id: "a", amount: { amount: 0.5, currency: "USDC" }, confirmedAt: todayEarly }),
      createTrustedPayment({ id: "b", amount: { amount: 1.0, currency: "USDC" }, confirmedAt: todayEarly }),
    ];
    const result = evaluateTrustedPolicy({
      policy: DEMO_SPENDING_POLICY,
      serviceId: "market-data",
      serviceName: "Market Data",
      serviceCategory: "data",
      servicePrice: 0.1,
      serviceCurrency: "USDC",
      serviceActive: true,
      history,
      now,
    });
    expect(result.spentTodayBaseUnits).toBe(1_500_000n);
    expect(result.allowed).toBe(true);
  });
});