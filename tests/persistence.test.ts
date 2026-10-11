import { describe, expect, it } from "vitest";

import { buildSpendingSummary, sumConfirmedToday } from "@/lib/agent/policy";
import {
  isValidConfirmedPayment,
  parseConfirmedPayments,
  toConfirmedPayment,
} from "@/lib/payments/records";
import type { ConfirmedPayment } from "@/types";

const RECIPIENT = "0x1234567890abcdef1234567890abcdef12345678" as const;
const TX = `0x${"a".repeat(64)}` as const;

function record(overrides: Partial<ConfirmedPayment> = {}): ConfirmedPayment {
  return {
    id: "pay_1",
    agentId: "agent_research_01",
    serviceId: "market-data",
    serviceName: "Market Data",
    amount: 0.1,
    currency: "USDC",
    recipient: RECIPIENT,
    chainId: 5042,
    status: "confirmed",
    txHash: TX,
    createdAt: "2026-09-21T10:00:00.000Z",
    ...overrides,
  };
}

describe("confirmed payment validation", () => {
  it("accepts a well-formed confirmed record", () => {
    expect(isValidConfirmedPayment(record())).toBe(true);
  });

  it("rejects a confirmed record without a transaction hash", () => {
    expect(isValidConfirmedPayment({ ...record(), txHash: undefined })).toBe(false);
    expect(isValidConfirmedPayment({ ...record(), txHash: "" })).toBe(false);
    expect(isValidConfirmedPayment({ ...record(), txHash: "0x123" })).toBe(false);
  });

  it("rejects a wrong chain id", () => {
    expect(isValidConfirmedPayment(record({ chainId: 1 }))).toBe(false);
    expect(isValidConfirmedPayment(record({ chainId: 0 }))).toBe(false);
  });

  it("accepts supported Arc networks", () => {
    expect(isValidConfirmedPayment(record({ chainId: 5042 }))).toBe(true);
    expect(isValidConfirmedPayment(record({ chainId: 5042002 }))).toBe(true);
  });

  it("rejects a non-confirmed status", () => {
    expect(isValidConfirmedPayment({ ...record(), status: "submitted" })).toBe(false);
    expect(isValidConfirmedPayment({ ...record(), status: "pending" })).toBe(false);
    expect(isValidConfirmedPayment({ ...record(), status: "failed" })).toBe(false);
  });

  it("rejects a malformed recipient, amount, or timestamp", () => {
    expect(isValidConfirmedPayment(record({ recipient: "0xnope" as ConfirmedPayment["recipient"] }))).toBe(false);
    expect(isValidConfirmedPayment(record({ amount: 0 }))).toBe(false);
    expect(isValidConfirmedPayment(record({ amount: Number.NaN }))).toBe(false);
    expect(isValidConfirmedPayment(record({ createdAt: "not-a-date" }))).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidConfirmedPayment(null)).toBe(false);
    expect(isValidConfirmedPayment("pay")).toBe(false);
    expect(isValidConfirmedPayment(42)).toBe(false);
  });
});

describe("parseConfirmedPayments", () => {
  it("ignores malformed records without throwing", () => {
    const parsed = parseConfirmedPayments([
      record({ id: "ok" }),
      { garbage: true },
      null,
      record({ id: "no-hash", txHash: "" as ConfirmedPayment["txHash"] }),
      record({ id: "wrong-chain", chainId: 137 }),
    ]);
    expect(parsed.map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("de-duplicates by id and by transaction hash", () => {
    const parsed = parseConfirmedPayments([
      record({ id: "a", txHash: `0x${"1".repeat(64)}` }),
      record({ id: "a", txHash: `0x${"2".repeat(64)}` }),
      record({ id: "b", txHash: `0x${"1".repeat(64)}` }),
    ]);
    expect(parsed).toHaveLength(1);
  });

  it("returns an empty list for non-array input", () => {
    expect(parseConfirmedPayments(null)).toEqual([]);
    expect(parseConfirmedPayments({})).toEqual([]);
  });
});

describe("toConfirmedPayment", () => {
  const baseEntry = {
    id: "pay_1",
    agentId: "agent_research_01",
    serviceId: "market-data",
    serviceName: "Market Data",
    recipient: RECIPIENT,
    chainId: 5042,
    amount: 0.1,
    currency: "USDC" as const,
    transactionHash: TX,
    failureReason: null,
    createdAt: "2026-09-21T10:00:00.000Z",
    updatedAt: "2026-09-21T10:00:00.000Z",
  };

  it("promotes only a confirmed entry", () => {
    const promoted = toConfirmedPayment({ ...baseEntry, phase: "confirmed" });
    expect(promoted?.txHash).toBe(TX);
  });

  it("refuses pending, submitted, and failed entries", () => {
    expect(toConfirmedPayment({ ...baseEntry, phase: "pending" })).toBeNull();
    expect(toConfirmedPayment({ ...baseEntry, phase: "submitted" })).toBeNull();
    expect(toConfirmedPayment({ ...baseEntry, phase: "failed" })).toBeNull();
  });

  it("refuses a confirmed entry with no hash", () => {
    expect(toConfirmedPayment({ ...baseEntry, phase: "confirmed", transactionHash: null })).toBeNull();
  });
});

describe("daily accounting", () => {
  // Built in LOCAL time so the day-boundary assertions are timezone-independent.
  const noon = new Date(2026, 8, 21, 12, 0, 0);
  const todayEarly = new Date(2026, 8, 21, 0, 30, 0).toISOString();
  const yesterdayLate = new Date(2026, 8, 20, 23, 30, 0).toISOString();
  const yesterdayNoon = new Date(2026, 8, 20, 12, 0, 0).toISOString();

  it("returns zero with no payments", () => {
    expect(sumConfirmedToday([], "USDC", noon)).toBe(0);
  });

  it("sums one confirmed payment", () => {
    const history = [record({ amount: 0.1, createdAt: todayEarly })];
    expect(sumConfirmedToday(history, "USDC", noon)).toBe(0.1);
  });

  it("sums multiple confirmed payments without float drift", () => {
    const history = [
      record({ id: "a", amount: 0.1, createdAt: todayEarly }),
      record({ id: "b", amount: 0.2, createdAt: todayEarly }),
      record({ id: "c", amount: 0.3, createdAt: todayEarly }),
    ];
    expect(sumConfirmedToday(history, "USDC", noon)).toBe(0.6);
  });

  it("ignores payments from a previous day", () => {
    const history = [record({ id: "old", amount: 4.5, createdAt: yesterdayNoon })];
    expect(sumConfirmedToday(history, "USDC", noon)).toBe(0);
  });

  it("counts today's payment only", () => {
    const history = [
      record({ id: "today", amount: 0.25, createdAt: todayEarly }),
      record({ id: "yesterday", amount: 4, createdAt: yesterdayLate }),
    ];
    expect(sumConfirmedToday(history, "USDC", noon)).toBe(0.25);
  });

  it("builds a spending summary with remaining budget", () => {
    const policy = {
      id: "p",
      agentId: "a",
      maxPerTransaction: 1,
      dailyLimit: 5,
      currency: "USDC" as const,
      allowedCategories: ["data"] as const,
    };
    const summary = buildSpendingSummary(
      policy,
      [record({ amount: 0.1, createdAt: todayEarly })],
      noon,
    );
    expect(summary.spentToday).toBe(0.1);
    expect(summary.remainingToday).toBe(4.9);
  });

  it("never reports a negative remaining budget", () => {
    const policy = {
      id: "p",
      agentId: "a",
      maxPerTransaction: 100,
      dailyLimit: 5,
      currency: "USDC" as const,
      allowedCategories: ["data"] as const,
    };
    const summary = buildSpendingSummary(
      policy,
      [record({ amount: 50, createdAt: todayEarly })],
      noon,
    );
    expect(summary.remainingToday).toBe(0);
  });
});
