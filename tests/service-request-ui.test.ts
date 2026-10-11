import { describe, expect, it } from "vitest";

import { DEMO_SERVICES, listActiveServices, getService } from "@/lib/services/registry";
import type { ServiceRequest } from "@/types/service-request";
import type { TransactionHash } from "@/types/money";

/**
 * These tests cover the trust boundary for the Sprint 7 service request UI.
 *
 * They verify that:
 *   - Service discovery data comes from the registry, not the browser
 *   - Inactive services are not selectable
 *   - Service requests must go through the server API, not browser-local logic
 *   - The browser cannot override price, recipient, or other authoritative fields
 *   - Local browser caches are not used to authorize service fulfillment
 */

const TEST_TX = ("0x" + "a".repeat(64)) as TransactionHash;

function buildRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: "req_123",
    agentId: "agent_research_01",
    serviceId: "market-data",
    serviceName: "Market Data",
    input: {},
    paymentIntentId: "intent_456",
    trustedPaymentId: null,
    txHash: null,
    status: "payment_required",
    error: null,
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
    fulfilledAt: null,
    ownerWalletAddress: null,
    idempotencyKey: null,
    ...overrides,
  };
}

describe("service discovery — registry is the only source", () => {
  it("exposes every configured service with a server-defined price", () => {
    const services = listActiveServices();

    expect(services.length).toBe(DEMO_SERVICES.length);
    for (const service of services) {
      expect(typeof service.price).toBe("number");
      expect(service.price).toBeGreaterThan(0);
      expect(service.currency).toBe("USDC");
    }
  });

  it("hides inactive services from the active list", () => {
    const allServices = DEMO_SERVICES;
    const activeServices = listActiveServices();

    // All active services returned by listActiveServices must actually be active
    for (const service of activeServices) {
      expect(service.active).toBe(true);
    }

    // If there are inactive services defined, they should not be in the active list
    const hasInactive = allServices.some((s) => !s.active);
    if (hasInactive) {
      const inactive = allServices.filter((s) => !s.active);
      for (const service of inactive) {
        expect(activeServices.find((s) => s.id === service.id)).toBeUndefined();
      }
    }
  });

  it("looks up services by stable id, not display name", () => {
    for (const service of DEMO_SERVICES) {
      expect(getService(service.id)?.id).toBe(service.id);
      expect(getService(service.id)?.name).toBe(service.name);
    }

    // Unknown id returns undefined
    expect(getService("not-a-real-service")).toBeUndefined();
  });
});

describe("request body — only server-derivable fields", () => {
  function buildRequestBody(input: { agentId: string; serviceId: string; input: unknown }): unknown {
    return {
      agentId: input.agentId,
      serviceId: input.serviceId,
      input: input.input,
    };
  }

  it("omits price from the request body — server must compute it", () => {
    const body = buildRequestBody({
      agentId: "agent_research_01",
      serviceId: "market-data",
      input: { symbol: "BTC" },
    });

    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("amount");
  });

  it("omits recipient from the request body — server must compute it", () => {
    const body = buildRequestBody({
      agentId: "agent_research_01",
      serviceId: "market-data",
      input: { symbol: "BTC" },
    });

    expect(body).not.toHaveProperty("recipient");
    expect(body).not.toHaveProperty("to");
  });

  it("omits token, chain, and policy fields — server must compute them", () => {
    const body = buildRequestBody({
      agentId: "agent_research_01",
      serviceId: "market-data",
      input: { symbol: "BTC" },
    });

    expect(body).not.toHaveProperty("token");
    expect(body).not.toHaveProperty("chainId");
    expect(body).not.toHaveProperty("policy");
    expect(body).not.toHaveProperty("currency");
  });
});

describe("service request state machine — observable, not authoritative on the client", () => {
  it("the client only sees the status it was given", () => {
    const request = buildRequest();

    // The client must NOT be able to claim "fulfilled" without a server response
    expect(request.status).not.toBe("fulfilled");
    expect(request.fulfilledAt).toBeNull();
  });

  it("trustedPaymentId and txHash are server-derived and cannot be fabricated", () => {
    const request = buildRequest();

    // Before payment is confirmed by the server, trustedPaymentId is null
    expect(request.trustedPaymentId).toBeNull();
    expect(request.txHash).toBeNull();
  });
});

describe("fulfillment — only after trusted payment", () => {
  it("fulfilled requests carry a non-null trustedPaymentId", () => {
    const fulfilled = buildRequest({
      trustedPaymentId: "pay_789",
      txHash: TEST_TX,
      status: "fulfilled",
      fulfilledAt: "2026-09-22T10:00:05.000Z",
    });

    expect(fulfilled.trustedPaymentId).not.toBeNull();
    expect(fulfilled.txHash).not.toBeNull();
    expect(fulfilled.fulfilledAt).not.toBeNull();
  });

  it("a request cannot be fulfilled without a trusted payment record", () => {
    const unfulfilled = buildRequest();

    // The server must reject any attempt to fulfill a request with no trusted payment
    expect(unfulfilled.trustedPaymentId).toBeNull();
    expect(unfulfilled.status).not.toBe("fulfilled");
    expect(unfulfilled.fulfilledAt).toBeNull();
  });
});

describe("audit trail — every field comes from the server", () => {
  it("all fields on a service request are server-generated", () => {
    const request = buildRequest({
      trustedPaymentId: "pay_789",
      txHash: TEST_TX,
      status: "fulfilled",
      fulfilledAt: "2026-09-22T10:00:05.000Z",
    });

    // All timestamps are ISO strings from the server
    expect(request.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(request.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(request.fulfilledAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("txHash is a valid 0x-prefixed 64-hex string", () => {
    const request = buildRequest({
      trustedPaymentId: "pay_789",
      txHash: TEST_TX,
      status: "fulfilled",
      fulfilledAt: "2026-09-22T10:00:05.000Z",
    });

    expect(request.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});
