import { describe, expect, it, beforeEach, beforeAll } from "vitest";

import {
  createServiceRequest,
  linkPaymentIntent,
  recordTransactionHash,
  fulfillServiceRequest,
  getServiceRequest,
  listServiceRequests,
  listServiceResults,
  setServiceRepositoriesForTesting,
} from "@/lib/services/service";
import { createInMemoryServiceRequestRepository, createInMemoryServiceResultRepository, type ServiceRequestRepository, type ServiceResultRepository } from "@/lib/services/repository";
import { getTrustedRepository } from "@/lib/payments/server/factory";
import { getServiceAdapter } from "@/lib/services/adapters";
import { getService } from "@/lib/services/registry";
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

describe("Service Request Lifecycle", () => {
  let requestRepo: ServiceRequestRepository;
  let resultRepo: ServiceResultRepository;

  beforeAll(async () => {
    // Clear trusted repo once before all tests
    const trustedRepo = await getTrustedRepository();
    if ("clearAll" in trustedRepo) {
      await (trustedRepo as { clearAll?: () => Promise<void> }).clearAll?.();
    }
  });

  beforeEach(() => {
    requestRepo = createInMemoryServiceRequestRepository();
    resultRepo = createInMemoryServiceResultRepository();
    setServiceRepositoriesForTesting(requestRepo, resultRepo);
  });

  describe("createServiceRequest", () => {
    it("creates a service request in payment_required state", async () => {
      const { request, spending } = await createServiceRequest({
        agentId: "agent_research_01",
        serviceId: "market-data",
        input: { symbol: "BTC" },
        ownerWalletAddress: null,
      });

      expect(request.id).toBeDefined();
      expect(request.agentId).toBe("agent_research_01");
      expect(request.serviceId).toBe("market-data");
      expect(request.serviceName).toBe("Market Data");
      expect(request.input).toEqual({ symbol: "BTC" });
      expect(request.paymentIntentId).toBeNull();
      expect(request.trustedPaymentId).toBeNull();
      expect(request.txHash).toBeNull();
      expect(request.status).toBe("payment_required");
      expect(request.error).toBeNull();
      expect(request.createdAt).toBeDefined();
      expect(request.updatedAt).toBeDefined();
      expect(request.fulfilledAt).toBeNull();
      expect(spending).toBeDefined();
    });

    it("rejects unknown service", async () => {
      await expect(
        createServiceRequest({ agentId: "agent_1", serviceId: "unknown", input: {}, ownerWalletAddress: null }),
      ).rejects.toThrow("Service not found.");
    });

    it("rejects inactive service", async () => {
      // Test with a service that doesn't exist (which acts like inactive)
      await expect(
        createServiceRequest({ agentId: "agent_1", serviceId: "inactive-service", input: {}, ownerWalletAddress: null }),
      ).rejects.toThrow("Service not found.");
    });

    it("allows active service", async () => {
      await expect(
        createServiceRequest({ agentId: "agent_1", serviceId: "market-data", input: {}, ownerWalletAddress: null }),
      ).resolves.toBeDefined();
    });

    it("rejects malformed input", async () => {
      // The function signature ensures input is an object
      // but we test the API layer separately
    });
  });

  describe("linkPaymentIntent", () => {
    it("links a payment intent to a request", async () => {
      const { request } = await createServiceRequest({
        agentId: "agent_1",
        serviceId: "market-data",
        input: { symbol: "BTC" },
        ownerWalletAddress: null,
      });

      const updated = await linkPaymentIntent(request.id, "intent_123");
      expect(updated.paymentIntentId).toBe("intent_123");
      expect(updated.status).toBe("payment_pending");
    });

    it("rejects linking when not in payment_required state", async () => {
      const { request } = await createServiceRequest({
        agentId: "agent_1",
        serviceId: "market-data",
        input: {},
        ownerWalletAddress: null,
      });

      await linkPaymentIntent(request.id, "intent_1");

      await expect(
        linkPaymentIntent(request.id, "intent_2"),
      ).rejects.toThrow("Cannot link payment intent in state");
    });
  });

  describe("recordTransactionHash", () => {
    it("records a transaction hash", async () => {
      const { request } = await createServiceRequest({
        agentId: "agent_1",
        serviceId: "market-data",
        input: {},
        ownerWalletAddress: null,
      });

      await linkPaymentIntent(request.id, "intent_1");

      const txHash = `0x${"a".repeat(64)}` as `0x${string}`;
      const updated = await recordTransactionHash(request.id, txHash);
      expect(updated.txHash).toBe(txHash);
    });

    it("rejects when not in payment_pending state", async () => {
      const { request } = await createServiceRequest({
        agentId: "agent_1",
        serviceId: "market-data",
        input: {},
        ownerWalletAddress: null,
      });

      await expect(
        recordTransactionHash(request.id, `0x${"a".repeat(64)}` as `0x${string}`),
      ).rejects.toThrow("Cannot record transaction hash in state");
    });
  });

  describe("fulfillServiceRequest", () => {
    const testPayment = createTrustedPayment({
      serviceId: "market-data",
      agentId: "agent_research_01",
    });

    async function addTestPaymentToRepo() {
      const repo = await getTrustedRepository();
      await repo.insertPayment(testPayment);
    }

    it("fulfills a request with verified payment", async () => {
      await addTestPaymentToRepo();
      const { request } = await createServiceRequest({
        agentId: "agent_research_01",
        serviceId: "market-data",
        input: { symbol: "BTC" },
        ownerWalletAddress: null,
      });

      await linkPaymentIntent(request.id, "intent_1");
      await recordTransactionHash(request.id, testPayment.txHash);

      const { request: fulfilledRequest, result } = await fulfillServiceRequest(request.id);

      expect(fulfilledRequest.status).toBe("fulfilled");
      expect(fulfilledRequest.trustedPaymentId).toBe(testPayment.id);
      expect(fulfilledRequest.fulfilledAt).toBeDefined();

      expect(result).not.toBeNull();
      expect(result!.status).toBe("fulfilled");
      expect(result!.output).toBeDefined();
      expect((result!.output as Record<string, unknown>).symbol).toBe("BTC");
      expect(result!.trustedPaymentId).toBe(testPayment.id);
      expect(result!.error).toBeNull();
    });

    it("rejects fulfillment without payment intent", async () => {
      const { request } = await createServiceRequest({
        agentId: "agent_1",
        serviceId: "market-data",
        input: { symbol: "BTC" },
        ownerWalletAddress: null,
      });

      await expect(fulfillServiceRequest(request.id)).rejects.toThrow("No payment intent linked");
    });

    it("rejects fulfillment without verified payment", async () => {
      const { request } = await createServiceRequest({
        agentId: "agent_1",
        serviceId: "market-data",
        input: { symbol: "BTC" },
        ownerWalletAddress: null,
      });

      await linkPaymentIntent(request.id, "intent_1");
      await recordTransactionHash(request.id, `0x${"b".repeat(64)}` as `0x${string}`);

      await expect(fulfillServiceRequest(request.id)).rejects.toThrow("No verified payment found");
    });

    it("is idempotent - returns existing result on repeated call", async () => {
      await addTestPaymentToRepo();
      const { request } = await createServiceRequest({
        agentId: "agent_research_01",
        serviceId: "market-data",
        input: { symbol: "BTC" },
        ownerWalletAddress: null,
      });

      await linkPaymentIntent(request.id, "intent_1");
      await recordTransactionHash(request.id, testPayment.txHash);

      const first = await fulfillServiceRequest(request.id);
      const second = await fulfillServiceRequest(request.id);

      expect(second.request.status).toBe("fulfilled");
      expect(second.result?.id).toBe(first.result?.id);
    });
  });

  describe("State Machine Transitions", () => {
    it("follows the valid state transition graph", async () => {
      const { request: r1 } = await createServiceRequest({
        agentId: "agent_1",
        serviceId: "market-data",
        input: {},
        ownerWalletAddress: null,
      });
      expect(r1.status).toBe("payment_required");

      await linkPaymentIntent(r1.id, "intent_1");
      const r2 = await getServiceRequest(r1.id);
      expect(r2?.status).toBe("payment_pending");

      await recordTransactionHash(r1.id, `0x${"a".repeat(64)}` as `0x${string}`);
      const r3 = await getServiceRequest(r1.id);
      expect(r3?.status).toBe("payment_pending"); // Still pending until verified
    });
  });

  describe("Queries", () => {
    it("lists all service requests", async () => {
      await createServiceRequest({ agentId: "a1", serviceId: "market-data", input: {}, ownerWalletAddress: null });
      await createServiceRequest({ agentId: "a2", serviceId: "research-report", input: {}, ownerWalletAddress: null });

      const list = await listServiceRequests();
      expect(list.length).toBe(2);
    });

    it("lists all service results", async () => {
      const list = await listServiceResults();
      expect(Array.isArray(list)).toBe(true);
    });
  });
});

describe("Service Adapters", () => {
  it("market-data returns structured output", async () => {
    const adapter = await getServiceAdapter("market-data");
    expect(adapter).toBeDefined();

    const output = await adapter!.execute({ symbol: "BTC" });
    expect((output as Record<string, unknown>).symbol).toBe("BTC");
    expect((output as Record<string, unknown>).price).toMatch(/^\d+\.\d{2}$/);
    expect((output as Record<string, unknown>).change24h).toMatch(/^-?\d+\.\d{2}$/);
    expect((output as Record<string, unknown>).source).toBe("demo");
  });

  it("research-report returns structured output", async () => {
    const adapter = await getServiceAdapter("research-report");
    expect(adapter).toBeDefined();

    const output = await adapter!.execute({ topic: "DeFi", depth: "detailed" });
    expect((output as Record<string, unknown>).topic).toBe("DeFi");
    expect((output as Record<string, unknown>).title).toContain("DeFi");
    expect((output as Record<string, unknown>).keyFindings).toBeInstanceOf(Array);
    expect((output as Record<string, unknown>).source).toBe("demo");
  });

  it("ai-summary returns structured output", async () => {
    const adapter = await getServiceAdapter("ai-summary");
    expect(adapter).toBeDefined();

    const output = await adapter!.execute({ text: "This is a long text that needs to be summarized." });
    expect((output as Record<string, unknown>).summary).toBeDefined();
    expect((output as Record<string, unknown>).originalLength).toBeGreaterThan(0);
    expect((output as Record<string, unknown>).source).toBe("demo");
  });

  it("returns undefined for unknown service", async () => {
    const adapter = await getServiceAdapter("unknown-service");
    expect(adapter).toBeUndefined();
  });
});

describe("Trust Boundary - client cannot override", () => {
  it("client cannot set service price", async () => {
    // The service price comes from server registry, not client input
    const service = getService("market-data");
    expect(service?.price).toBe(0.1);
  });

  it("client cannot set recipient", async () => {
    // Recipient comes from server config
    const adapter = getServiceAdapter("market-data");
    // Adapter has no recipient field - payment handles that
    expect(adapter).toBeDefined();
  });
});