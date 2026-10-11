import { describe, expect, it } from "vitest";

import {
  canTransition,
  hasPayments,
  initialPaymentsState,
  paymentsReducer,
  selectLatestEntry,
  selectPayments,
} from "@/lib/payments/store";

const TX_HASH = `0x${"a".repeat(64)}` as const;
const RECIPIENT = "0x1234567890abcdef1234567890abcdef12345678" as const;
const CREATED_AT = "2026-09-21T10:00:00.000Z";

const CREATED = {
  type: "payment/created",
  id: "pay_1",
  agentId: "agent_research_01",
  serviceId: "market-data",
  serviceName: "Market Data",
  recipient: RECIPIENT,
  chainId: 5042,
  amount: 0.1,
  currency: "USDC",
  createdAt: CREATED_AT,
} as const;

const createdState = paymentsReducer(initialPaymentsState, CREATED);

describe("payment store — honest empty state", () => {
  it("starts with no payments", () => {
    expect(initialPaymentsState.entries).toHaveLength(0);
    expect(hasPayments(initialPaymentsState)).toBe(false);
    expect(selectPayments(initialPaymentsState)).toHaveLength(0);
    expect(selectLatestEntry(initialPaymentsState)).toBeNull();
  });

  it("does not invent a transaction hash on creation", () => {
    const entry = createdState.entries[0];
    expect(entry?.phase).toBe("pending");
    expect(entry?.transactionHash).toBeNull();
    expect(selectLatestEntry(createdState)?.id).toBe("pay_1");
  });
});

describe("payment store — transitions", () => {
  it("enforces the allowed transition graph", () => {
    expect(canTransition("idle", "pending")).toBe(true);
    expect(canTransition("pending", "submitted")).toBe(true);
    expect(canTransition("pending", "confirmed")).toBe(false);
    expect(canTransition("submitted", "confirmed")).toBe(true);
    expect(canTransition("submitted", "failed")).toBe(true);
    expect(canTransition("confirmed", "failed")).toBe(false);
    expect(canTransition("failed", "confirmed")).toBe(false);
  });

  it("moves idle -> pending -> submitted -> confirmed", () => {
    expect(createdState.entries[0]?.phase).toBe("pending");

    const submitted = paymentsReducer(createdState, {
      type: "payment/submitted",
      id: "pay_1",
      transactionHash: TX_HASH,
      at: "2026-09-21T10:00:05.000Z",
    });
    expect(submitted.entries[0]?.phase).toBe("submitted");
    expect(submitted.entries[0]?.transactionHash).toBe(TX_HASH);

    const confirmed = paymentsReducer(submitted, {
      type: "payment/confirmed",
      id: "pay_1",
      at: "2026-09-21T10:00:12.000Z",
    });
    expect(confirmed.entries[0]?.phase).toBe("confirmed");
    expect(confirmed.entries[0]?.transactionHash).toBe(TX_HASH);
  });

  it("refuses to confirm without a transaction hash", () => {
    const result = paymentsReducer(createdState, {
      type: "payment/confirmed",
      id: "pay_1",
      at: "2026-09-21T10:00:12.000Z",
    });
    expect(result).toBe(createdState);
  });

  it("refuses an illegal jump from pending straight to confirmed", () => {
    const result = paymentsReducer(createdState, {
      type: "payment/confirmed",
      id: "pay_1",
      transactionHash: TX_HASH,
      at: "2026-09-21T10:00:12.000Z",
    });
    expect(result).toBe(createdState);
  });

  it("fails a pending payment when the wallet rejects it", () => {
    const failed = paymentsReducer(createdState, {
      type: "payment/failed",
      id: "pay_1",
      reason: "Payment cancelled in the wallet. Nothing was sent.",
      at: "2026-09-21T10:00:05.000Z",
    });
    expect(failed.entries[0]?.phase).toBe("failed");
    expect(failed.entries[0]?.transactionHash).toBeNull();
  });

  it("blocks submission of an unknown id", () => {
    const result = paymentsReducer(createdState, {
      type: "payment/submitted",
      id: "missing",
      transactionHash: TX_HASH,
      at: "2026-09-21T10:00:05.000Z",
    });
    expect(result).toBe(createdState);
  });

  it("ignores duplicate ids", () => {
    expect(paymentsReducer(createdState, CREATED)).toBe(createdState);
  });
});
