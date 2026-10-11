import { describe, expect, it, beforeEach } from "vitest";

import { createInMemoryTrustedRepository, type TrustedPaymentRepository } from "@/lib/payments/server/repository";
import type { PaymentIntent, TrustedPayment, TransactionHash } from "@/types";

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

function createPaymentIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  const now = new Date().toISOString();
  return {
    id: "intent_1",
    agentId: "agent_research_01",
    serviceId: "market-data",
    serviceName: "Market Data",
    sender: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    recipient: "0x1234567890abcdef1234567890abcdef12345678",
    amount: { amount: 0.1, currency: "USDC" },
    amountBaseUnits: "100000",
    currency: "USDC",
    chainId: 5042,
    tokenAddress: "0x1234567890abcdef1234567890abcdef12345678",
    status: "pending",
    txHash: null,
    createdAt: now,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    ownerWalletAddress: null,
    ...overrides,
  };
}

describe("TrustedPaymentRepository (in-memory)", () => {
  let repo: TrustedPaymentRepository;

  beforeEach(() => {
    repo = createInMemoryTrustedRepository();
  });

  describe("persistence descriptor", () => {
    it("reports in-memory non-durable persistence", () => {
      expect(repo.persistence.kind).toBe("in-memory");
      expect(repo.persistence.durable).toBe(false);
    });
  });

  describe("intents", () => {
    it("creates and retrieves an intent", async () => {
      const intent = createPaymentIntent();
      await repo.createIntent(intent);

      const retrieved = await repo.getIntent(intent.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(intent.id);
      expect(retrieved?.agentId).toBe(intent.agentId);
      expect(retrieved?.serviceId).toBe(intent.serviceId);
      expect(retrieved?.status).toBe("pending");
    });

    it("rejects duplicate intent id", async () => {
      const intent = createPaymentIntent();
      await repo.createIntent(intent);
      await expect(repo.createIntent(intent)).rejects.toThrow("Duplicate intent id.");
    });

    it("returns null for unknown intent", async () => {
      const retrieved = await repo.getIntent("unknown");
      expect(retrieved).toBeNull();
    });

    it("consumes an intent with txHash", async () => {
      const intent = createPaymentIntent();
      await repo.createIntent(intent);

      const txHash = `0x${"b".repeat(64)}` as TransactionHash;
      const at = new Date().toISOString();
      await repo.consumeIntent(intent.id, txHash, at);

      const retrieved = await repo.getIntent(intent.id);
      expect(retrieved?.status).toBe("consumed");
      expect(retrieved?.txHash).toBe(txHash);
    });

    it("ignores consume on unknown intent", async () => {
      await repo.consumeIntent("unknown", `0x${"b".repeat(64)}` as TransactionHash, new Date().toISOString());
      // Should not throw
    });
  });

  describe("payments", () => {
    it("inserts a new payment record", async () => {
      const payment = createTrustedPayment();
      const result = await repo.insertPayment(payment);

      expect(result.created).toBe(true);
      expect(result.record.id).toBe(payment.id);
      expect(result.record.txHash).toBe(payment.txHash);
    });

    it("finds a payment by transaction hash", async () => {
      const payment = createTrustedPayment();
      await repo.insertPayment(payment);

      const found = await repo.findByTxHash(payment.txHash);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(payment.id);
      expect(found?.txHash).toBe(payment.txHash);
    });

    it("finds a payment by id", async () => {
      const payment = createTrustedPayment();
      await repo.insertPayment(payment);

      const found = await repo.findById(payment.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(payment.id);
      expect(found?.txHash).toBe(payment.txHash);
    });

    it("returns null for unknown transaction hash", async () => {
      const found = await repo.findByTxHash(`0x${"z".repeat(64)}`);
      expect(found).toBeNull();
    });

    it("returns null for unknown id", async () => {
      const found = await repo.findById("unknown");
      expect(found).toBeNull();
    });

    it("is idempotent on transaction hash — returns existing record", async () => {
      const payment = createTrustedPayment();
      await repo.insertPayment(payment);

      const result = await repo.insertPayment(payment);
      expect(result.created).toBe(false);
      expect(result.record.id).toBe(payment.id);
    });

    it("is idempotent on transaction hash with different id — returns existing record", async () => {
      const payment1 = createTrustedPayment({ id: "pay_1" });
      const payment2 = createTrustedPayment({ id: "pay_2" }); // Different id, same txHash
      await repo.insertPayment(payment1);

      const result = await repo.insertPayment(payment2);
      expect(result.created).toBe(false);
      expect(result.record.id).toBe("pay_1"); // Original id preserved
    });

    it("lists payments in confirmedAt order", async () => {
      const now = new Date();
      const p1 = createTrustedPayment({
        id: "pay_1",
        txHash: `0x${"1".repeat(64)}`,
        confirmedAt: new Date(now.getTime() + 1000).toISOString(),
        createdAt: new Date(now.getTime() + 1000).toISOString(),
      });
      const p2 = createTrustedPayment({
        id: "pay_2",
        txHash: `0x${"2".repeat(64)}`,
        confirmedAt: new Date(now.getTime() + 2000).toISOString(),
        createdAt: new Date(now.getTime() + 2000).toISOString(),
      });
      const p3 = createTrustedPayment({
        id: "pay_3",
        txHash: `0x${"3".repeat(64)}`,
        confirmedAt: new Date(now.getTime() + 3000).toISOString(),
        createdAt: new Date(now.getTime() + 3000).toISOString(),
      });

      await repo.insertPayment(p2);
      await repo.insertPayment(p1);
      await repo.insertPayment(p3);

      const listed = await repo.listPayments();
      expect(listed.map((p) => p.id)).toEqual(["pay_1", "pay_2", "pay_3"]);
    });

    it("clears all intents and payments", async () => {
      const intent = createPaymentIntent();
      const payment = createTrustedPayment();
      await repo.createIntent(intent);
      await repo.insertPayment(payment);

      await repo.clearAll();

      expect(await repo.getIntent(intent.id)).toBeNull();
      expect(await repo.findByTxHash(payment.txHash)).toBeNull();
      expect(await repo.findById(payment.id)).toBeNull();
      expect(await repo.listPayments()).toHaveLength(0);
    });
  });
});

describe("TrustedPaymentRepository contract (interface)", () => {
  // This test verifies the interface shape is satisfied by any implementation.
  // It runs the same assertions against the in-memory adapter.
  // The Postgres adapter is not tested here (requires DATABASE_URL).

  function testRepository(repo: TrustedPaymentRepository) {
    it("has correct persistence descriptor shape", () => {
      expect(repo.persistence).toHaveProperty("kind");
      expect(repo.persistence).toHaveProperty("durable");
      expect(repo.persistence).toHaveProperty("label");
      expect(repo.persistence).toHaveProperty("note");
    });

    it("supports full CRUD flow", async () => {
      const intent = createPaymentIntent();
      await repo.createIntent(intent);

      const retrieved = await repo.getIntent(intent.id);
      expect(retrieved).not.toBeNull();

      const payment = createTrustedPayment();
      const inserted = await repo.insertPayment(payment);
      expect(inserted.created).toBe(true);

      const byHash = await repo.findByTxHash(payment.txHash);
      expect(byHash?.id).toBe(payment.id);

      const byId = await repo.findById(payment.id);
      expect(byId?.id).toBe(payment.id);

      const listed = await repo.listPayments();
      expect(listed.some((p) => p.id === payment.id)).toBe(true);

      await repo.clearAll();
      expect(await repo.listPayments()).toHaveLength(0);
    });
  }

  describe("in-memory implementation", () => {
    testRepository(createInMemoryTrustedRepository());
  });
});