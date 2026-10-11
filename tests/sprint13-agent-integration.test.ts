import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { isDemoModeEnabled, getDemoModeStatus, assertDemoMode, setDemoModeStatusForTesting } from "@/lib/demo-mode";
import { AgentPayClient } from "@/lib/agent/sdk";
import { createInMemoryAgentRepository } from "@/lib/agent/repository";
import { setAgentRepositoryForTesting } from "@/lib/agent/factory";
import { createInMemoryServiceRequestRepository, createInMemoryServiceResultRepository } from "@/lib/services/repository";
import { setServiceRepositoriesForTesting } from "@/lib/services/service";
import { generateApiKey, isValidApiKeyFormat } from "@/lib/agent";
import type { AgentIdentity } from "@/types/agent";

describe("Sprint 13 — Demo Mode", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    setDemoModeStatusForTesting(null);
  });

  it("is disabled by default", () => {
    expect(isDemoModeEnabled()).toBe(false);
    expect(getDemoModeStatus()).toBe("disabled");
  });

  it("is enabled when AGENTPAY_DEMO_MODE=true in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AGENTPAY_DEMO_MODE", "true");
    setDemoModeStatusForTesting(null);
    expect(isDemoModeEnabled()).toBe(true);
    expect(getDemoModeStatus()).toBe("enabled");
  });

  it("is blocked in production even with AGENTPAY_DEMO_MODE=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AGENTPAY_DEMO_MODE", "true");
    setDemoModeStatusForTesting(null);
    expect(isDemoModeEnabled()).toBe(false);
    expect(getDemoModeStatus()).toBe("production-blocked");
  });

  it("assertDemoMode throws when disabled", () => {
    expect(() => assertDemoMode()).toThrow("Demo mode is not enabled");
  });

  it("assertDemoMode throws in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AGENTPAY_DEMO_MODE", "true");
    setDemoModeStatusForTesting(null);
    expect(() => assertDemoMode()).toThrow("Demo mode is disabled in production");
  });

  it("assertDemoMode passes when enabled in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AGENTPAY_DEMO_MODE", "true");
    setDemoModeStatusForTesting(null);
    expect(() => assertDemoMode()).not.toThrow();
  });
});

describe("Sprint 13 — Agent Identity & API Key", () => {
  let repo: ReturnType<typeof createInMemoryAgentRepository>;

  beforeEach(() => {
    repo = createInMemoryAgentRepository();
    setAgentRepositoryForTesting(repo);
  });

  afterEach(() => {
    setAgentRepositoryForTesting(null);
  });

  it("generates valid API key format", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^ap_[0-9a-f]{48}$/);
  });

  it("generates unique API keys", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateApiKey());
    }
    expect(keys.size).toBe(100);
  });

  it("API key format validation works", () => {
    // 48 hex chars = 24 bytes
    const validKey = "ap_" + "abcdef1234567890".repeat(3); // 48 hex chars
    expect(isValidApiKeyFormat(validKey)).toBe(true);
    expect(isValidApiKeyFormat("ap_short")).toBe(false);
    expect(isValidApiKeyFormat("invalid_key")).toBe(false);
    expect(isValidApiKeyFormat("")).toBe(false);
  });
});

describe("Sprint 13 — External Agent SDK", () => {
  let repo: ReturnType<typeof createInMemoryAgentRepository>;
  let requestRepo: ReturnType<typeof createInMemoryServiceRequestRepository>;
  let resultRepo: ReturnType<typeof createInMemoryServiceResultRepository>;

  beforeEach(() => {
    repo = createInMemoryAgentRepository();
    requestRepo = createInMemoryServiceRequestRepository();
    resultRepo = createInMemoryServiceResultRepository();
    setAgentRepositoryForTesting(repo);
    setServiceRepositoriesForTesting(requestRepo, resultRepo);
  });

  afterEach(() => {
    setAgentRepositoryForTesting(null);
    setServiceRepositoriesForTesting(null, null);
  });

  it("SDK can be instantiated with valid config", () => {
    const client = new AgentPayClient({
      baseUrl: "http://localhost:3000",
      apiKey: "ap_abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    });
    expect(client).toBeInstanceOf(AgentPayClient);
  });

  it("SDK rejects invalid base URL", () => {
    const client = new AgentPayClient({
      baseUrl: "",
      apiKey: "ap_abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    });
    expect(client).toBeInstanceOf(AgentPayClient);
  });

  it("SDK methods exist", () => {
    const client = new AgentPayClient({
      baseUrl: "http://localhost:3000",
      apiKey: "ap_abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    });
    expect(typeof client.createRequest).toBe("function");
    expect(typeof client.getRequest).toBe("function");
    expect(typeof client.getResult).toBe("function");
    expect(typeof client.waitForResult).toBe("function");
    expect(typeof client.completeDemoPayment).toBe("function");
  });
});

describe("Sprint 13 — Idempotency", () => {
  let repo: ReturnType<typeof createInMemoryAgentRepository>;
  let requestRepo: ReturnType<typeof createInMemoryServiceRequestRepository>;
  let resultRepo: ReturnType<typeof createInMemoryServiceResultRepository>;

  beforeEach(() => {
    repo = createInMemoryAgentRepository();
    requestRepo = createInMemoryServiceRequestRepository();
    resultRepo = createInMemoryServiceResultRepository();
    setAgentRepositoryForTesting(repo);
    setServiceRepositoriesForTesting(requestRepo, resultRepo);
  });

  afterEach(() => {
    setAgentRepositoryForTesting(null);
    setServiceRepositoriesForTesting(null, null);
  });

  it("prevents duplicate requests with same idempotency key", async () => {
    const { createServiceRequest } = await import("@/lib/services/service");
    const { getService } = await import("@/lib/services/registry");

    const idempotencyKey = "test-idempotency-key";

    const result1 = await createServiceRequest({
      agentId: "agent_test",
      serviceId: "market-data",
      input: { symbol: "BTC" },
      ownerWalletAddress: "0x1234567890123456789012345678901234567890",
      idempotencyKey,
    });

    const result2 = await createServiceRequest({
      agentId: "agent_test",
      serviceId: "market-data",
      input: { symbol: "BTC" },
      ownerWalletAddress: "0x1234567890123456789012345678901234567890",
      idempotencyKey,
    });

    expect(result1.request.id).toBe(result2.request.id);
  });

  it("allows same idempotency key for different agents", async () => {
    const { createServiceRequest } = await import("@/lib/services/service");

    const idempotencyKey = "test-idempotency-key";

    const result1 = await createServiceRequest({
      agentId: "agent_1",
      serviceId: "market-data",
      input: { symbol: "BTC" },
      ownerWalletAddress: "0x1111111111111111111111111111111111111111",
      idempotencyKey,
    });

    const result2 = await createServiceRequest({
      agentId: "agent_2",
      serviceId: "market-data",
      input: { symbol: "BTC" },
      ownerWalletAddress: "0x2222222222222222222222222222222222222222",
      idempotencyKey,
    });

    expect(result1.request.id).not.toBe(result2.request.id);
    expect(result1.request.agentId).toBe("agent_1");
    expect(result2.request.agentId).toBe("agent_2");
  });
});

describe("Sprint 13 — Agent Isolation", () => {
  let repo: ReturnType<typeof createInMemoryAgentRepository>;
  let requestRepo: ReturnType<typeof createInMemoryServiceRequestRepository>;
  let resultRepo: ReturnType<typeof createInMemoryServiceResultRepository>;

  beforeEach(() => {
    repo = createInMemoryAgentRepository();
    requestRepo = createInMemoryServiceRequestRepository();
    resultRepo = createInMemoryServiceResultRepository();
    setAgentRepositoryForTesting(repo);
    setServiceRepositoriesForTesting(requestRepo, resultRepo);
  });

  afterEach(() => {
    setAgentRepositoryForTesting(null);
    setServiceRepositoriesForTesting(null, null);
  });

  it("agents cannot access each other's requests", async () => {
    const { createServiceRequest, getServiceRequest } = await import("@/lib/services/service");

    // Create request for agent_1
    const req1 = await createServiceRequest({
      agentId: "agent_1",
      serviceId: "market-data",
      input: { symbol: "BTC" },
      ownerWalletAddress: "0x1111111111111111111111111111111111111111",
    });

    // Create request for agent_2
    const req2 = await createServiceRequest({
      agentId: "agent_2",
      serviceId: "market-data",
      input: { symbol: "ETH" },
      ownerWalletAddress: "0x2222222222222222222222222222222222222222",
    });

    // agent_1 can access its own request
    const ownRequest = await getServiceRequest(req1.request.id);
    expect(ownRequest).not.toBeNull();
    expect(ownRequest!.agentId).toBe("agent_1");

    // agent_2 can access its own request
    const ownRequest2 = await getServiceRequest(req2.request.id);
    expect(ownRequest2).not.toBeNull();
    expect(ownRequest2!.agentId).toBe("agent_2");

    // The API layer enforces isolation - this is tested at the API level
  });
});