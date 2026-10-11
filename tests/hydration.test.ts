import { describe, expect, it } from "vitest";

import { DEMO_SPENDING_POLICY } from "@/lib/demo/agent";
import { evaluatePaymentGate } from "@/lib/payments/gate";
import { createPaymentRepository } from "@/lib/payments/repository";
import { InMemoryStorage, PAYMENT_STORAGE_KEY } from "@/lib/payments/storage";
import {
  initialPaymentsState,
  paymentsReducer,
  selectConfirmedPayments,
  selectEntryById,
} from "@/lib/payments/store";
import { getService } from "@/lib/services/registry";
import type { ConfirmedPayment } from "@/types";

const TX = `0x${"a".repeat(64)}` as const;
const TX_2 = `0x${"b".repeat(64)}` as const;

function record(overrides: Partial<ConfirmedPayment> = {}): ConfirmedPayment {
  return {
    id: "pay_1",
    agentId: "agent_research_01",
    serviceId: "market-data",
    serviceName: "Market Data",
    amount: 0.1,
    currency: "USDC",
    recipient: "0x1234567890abcdef1234567890abcdef12345678",
    chainId: 5042,
    status: "confirmed",
    txHash: TX,
    createdAt: "2026-09-21T10:00:00.000Z",
    ...overrides,
  };
}

function createStore() {
  const storage = new InMemoryStorage();
  return { storage, repository: createPaymentRepository(storage) };
}

describe("payment repository", () => {
  it("saves and loads a confirmed payment", () => {
    const { repository } = createStore();
    repository.save(record());
    expect(repository.load()).toHaveLength(1);
    expect(repository.load()[0]?.txHash).toBe(TX);
  });

  it("persists across a fresh repository instance sharing the same storage", () => {
    const { storage, repository } = createStore();
    repository.save(record());

    const reloaded = createPaymentRepository(storage);
    expect(reloaded.load().map((entry) => entry.id)).toEqual(["pay_1"]);
  });

  it("de-duplicates by id and hash on save", () => {
    const { repository } = createStore();
    repository.save(record());
    repository.save(record());
    repository.save(record({ id: "pay_2", txHash: TX }));
    expect(repository.load()).toHaveLength(1);

    repository.save(record({ id: "pay_3", txHash: TX_2 }));
    expect(repository.load()).toHaveLength(2);
  });

  it("saves many at once", () => {
    const { repository } = createStore();
    repository.saveMany([record({ id: "a", txHash: TX }), record({ id: "b", txHash: TX_2 })]);
    expect(repository.load()).toHaveLength(2);
  });

  it("never persists an unconfirmed or invalid record", () => {
    const { storage, repository } = createStore();
    repository.saveMany([
      record({ id: "no-hash", txHash: "" as ConfirmedPayment["txHash"] }),
      record({ id: "wrong-chain", chainId: 137 }),
      { ...record(), status: "pending" } as unknown as ConfirmedPayment,
    ]);
    expect(repository.load()).toEqual([]);
    expect(storage.getItem(PAYMENT_STORAGE_KEY)).toBeNull();
  });

  it("ignores corrupted JSON without throwing", () => {
    const { storage, repository } = createStore();
    storage.setItem(PAYMENT_STORAGE_KEY, "{not json");
    expect(() => repository.load()).not.toThrow();
    expect(repository.load()).toEqual([]);
  });

  it("drops malformed entries from stored JSON", () => {
    const { storage, repository } = createStore();
    storage.setItem(
      PAYMENT_STORAGE_KEY,
      JSON.stringify([record(), { nope: true }, record({ id: "bad", chainId: 1 })]),
    );
    expect(repository.load().map((entry) => entry.id)).toEqual(["pay_1"]);
  });

  it("clears local history", () => {
    const { repository } = createStore();
    repository.save(record());
    repository.clear();
    expect(repository.load()).toEqual([]);
  });

  it("declares itself as untrusted local persistence", () => {
    const { repository } = createStore();
    expect(repository.persistence.kind).toBe("local-browser");
    expect(repository.persistence.trusted).toBe(false);
  });
});

describe("hydration path (repository -> store)", () => {
  it("restores confirmed payments into a fresh store", () => {
    const { repository } = createStore();
    repository.saveMany([record({ id: "a", txHash: TX }), record({ id: "b", txHash: TX_2, amount: 0.25 })]);

    const hydrated = paymentsReducer(initialPaymentsState, {
      type: "payment/hydrated",
      records: repository.load(),
    });

    expect(hydrated.entries).toHaveLength(2);
    expect(selectConfirmedPayments(hydrated)).toHaveLength(2);
    expect(selectEntryById(hydrated, "b")?.amount).toBe(0.25);
  });

  it("survives a simulated reload with the same storage", () => {
    const { storage, repository } = createStore();
    repository.save(record({ id: "persisted", txHash: TX }));

    // Simulate a page reload: brand new store, same underlying storage.
    const reloadedRepository = createPaymentRepository(storage);
    const reloadedStore = paymentsReducer(initialPaymentsState, {
      type: "payment/hydrated",
      records: reloadedRepository.load(),
    });

    expect(selectConfirmedPayments(reloadedStore).map((entry) => entry.id)).toEqual(["persisted"]);
  });

  it("ignores records already present in memory", () => {
    const { repository } = createStore();
    const saved = record();
    repository.save(saved);

    const inMemory = paymentsReducer(initialPaymentsState, {
      type: "payment/hydrated",
      records: [saved],
    });
    const again = paymentsReducer(inMemory, {
      type: "payment/hydrated",
      records: repository.load(),
    });

    expect(again.entries).toHaveLength(1);
  });

  it("rejects an invalid hydrated record even if the caller passes it directly", () => {
    const hydrated = paymentsReducer(initialPaymentsState, {
      type: "payment/hydrated",
      records: [{ ...record(), txHash: "0xdeadbeef" } as unknown as ConfirmedPayment],
    });
    expect(hydrated.entries).toHaveLength(0);
  });

  it("has no effect when there is nothing to restore", () => {
    const hydrated = paymentsReducer(initialPaymentsState, {
      type: "payment/hydrated",
      records: [],
    });
    expect(hydrated).toBe(initialPaymentsState);
  });
});

describe("end to end: persist -> reload -> policy accounting", () => {
  const RECIPIENT = "0x1234567890abcdef1234567890abcdef12345678";

  function gateOn(store: ReturnType<typeof paymentsReducer>) {
    const service = getService("market-data");
    if (!service) throw new Error("market-data service is missing");
    return evaluatePaymentGate({
      service,
      policy: DEMO_SPENDING_POLICY,
      confirmedHistory: selectConfirmedPayments(store),
      resolveRecipient: (serviceId) => ({
        serviceId,
        address: RECIPIENT as `0x${string}`,
        isDemo: true,
      }),
    });
  }

  it("a confirmed payment survives reload and counts toward the daily limit", () => {
    const storage = new InMemoryStorage();
    const repository = createPaymentRepository(storage);

    // Session 1: a payment is confirmed and written through the repository.
    repository.save(
      record({
        id: "session1",
        txHash: TX,
        amount: 4.95,
        createdAt: new Date().toISOString(),
      }),
    );

    // Reload: brand new store hydrated from the same storage.
    const reloadedStore = paymentsReducer(initialPaymentsState, {
      type: "payment/hydrated",
      records: createPaymentRepository(storage).load(),
    });

    expect(selectConfirmedPayments(reloadedStore)).toHaveLength(1);

    // The gate now sees the persisted spend and blocks a $0.10 request.
    const result = gateOn(reloadedStore);
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.kind).toBe("policy");
      expect(result.violations.map((v) => v.code)).toContain("EXCEEDS_DAILY_LIMIT");
      expect(result.spending.spentToday).toBe(4.95);
      expect(result.spending.remainingToday).toBe(0.05);
    }
  });

  it("approves when persisted spend still leaves room", () => {
    const storage = new InMemoryStorage();
    const repository = createPaymentRepository(storage);
    repository.save(
      record({ id: "session1", txHash: TX, amount: 4.9, createdAt: new Date().toISOString() }),
    );

    const reloadedStore = paymentsReducer(initialPaymentsState, {
      type: "payment/hydrated",
      records: createPaymentRepository(storage).load(),
    });

    const result = gateOn(reloadedStore);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.spending.spentToday).toBe(4.9);
      expect(result.spending.remainingToday).toBe(0.1);
    }
  });

  it("does not count a previous-day payment toward today's limit", () => {
    const storage = new InMemoryStorage();
    const repository = createPaymentRepository(storage);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    repository.save(
      record({
        id: "yesterday",
        txHash: TX,
        amount: 4.95,
        createdAt: yesterday.toISOString(),
      }),
    );

    const reloadedStore = paymentsReducer(initialPaymentsState, {
      type: "payment/hydrated",
      records: createPaymentRepository(storage).load(),
    });

    // Still in the ledger, but excluded from today's spend.
    expect(selectConfirmedPayments(reloadedStore)).toHaveLength(1);
    const result = gateOn(reloadedStore);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.spending.spentToday).toBe(0);
      expect(result.spending.remainingToday).toBe(5);
    }
  });

  it("ignores a corrupted store and still approves", () => {
    const storage = new InMemoryStorage();
    storage.setItem(PAYMENT_STORAGE_KEY, '{"broken": true}');

    const reloadedStore = paymentsReducer(initialPaymentsState, {
      type: "payment/hydrated",
      records: createPaymentRepository(storage).load(),
    });

    expect(reloadedStore.entries).toHaveLength(0);
    expect(gateOn(reloadedStore).status).toBe("ready");
  });
});
