/**
 * AgentPay External Agent SDK
 *
 * TypeScript client for external AI agents to interact with AgentPay.
 *
 * This SDK provides a clean interface for:
 * - Creating service requests
 * - Checking request status
 * - Retrieving service results
 *
 * IMPORTANT: This SDK NEVER handles wallet private keys.
 * All payments require explicit human wallet approval via the AgentPay web UI.
 */

import type { EvmAddress } from "@/types/money";

export interface AgentPayConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ServiceRequestInput {
  serviceId: string;
  input: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface PaymentDetails {
  intentId: string;
  amount: { amount: number; currency: "USDC" };
  currency: "USDC";
  recipient: EvmAddress;
  chainId: number;
  tokenAddress: EvmAddress;
  expiresAt: string;
}

export interface SpendingSummary {
  currency: "USDC";
  dailyLimit: number;
  spentToday: number;
  remainingToday: number;
  zone: "utc" | "local";
}

export interface CreateRequestResponse {
  ok: true;
  requestId: string;
  status: "payment_required";
  payment: PaymentDetails;
  spending: SpendingSummary;
}

export interface RequestStatusResponse {
  ok: true;
  requestId: string;
  status: string;
  serviceId: string;
  serviceName: string;
  createdAt: string;
  updatedAt: string;
  payment?: {
    intentId?: string;
    trustedPaymentId?: string;
    txHash?: string;
  };
  error?: string;
}

export interface ResultResponse {
  ok: true;
  status: "READY" | "NOT_READY" | "REJECTED";
  requestId: string;
  serviceRequestStatus?: string;
  result?: {
    id: string;
    requestId: string;
    serviceId: string;
    status: "fulfilled" | "failed";
    output: Record<string, unknown> | null;
    error: string | null;
    trustedPaymentId: string;
    fulfilledAt: string;
    createdAt: string;
  };
}

export interface AgentError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type RequestResult<T> = T | AgentError;

export class AgentPayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: AgentPayConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<RequestResult<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error ?? { code: "UNKNOWN_ERROR", message: "Request failed" },
      };
    }

    return data as T;
  }

  /**
   * Create a new service request.
   *
   * Returns a payment intent that requires human wallet approval.
   * The agent should poll for status until payment is confirmed.
   */
  async createRequest(
    input: ServiceRequestInput,
  ): Promise<RequestResult<CreateRequestResponse>> {
    const headers: Record<string, string> = {};
    if (input.idempotencyKey) {
      headers["Idempotency-Key"] = input.idempotencyKey;
    }

    return this.request<CreateRequestResponse>("/api/agent/v1/requests", {
      method: "POST",
      body: JSON.stringify({
        serviceId: input.serviceId,
        input: input.input,
      }),
      headers,
    });
  }

  /**
   * Get the status of a service request.
   */
  async getRequest(requestId: string): Promise<RequestResult<RequestStatusResponse>> {
    return this.request<RequestStatusResponse>(`/api/agent/v1/requests/${requestId}`, {
      method: "GET",
    });
  }

  /**
   * Get the service result for a completed request.
   *
   * Only returns the result when:
   * - Trusted payment exists
   * - Fulfillment has completed
   */
  async getResult(requestId: string): Promise<RequestResult<ResultResponse>> {
    return this.request<ResultResponse>(`/api/agent/v1/requests/${requestId}/result`, {
      method: "GET",
    });
  }

  /**
   * Poll for request completion.
   *
   * Waits for the request to reach a terminal state (fulfilled or failed).
   * Returns the final result when ready.
   */
  async waitForResult(
    requestId: string,
    options: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<RequestResult<ResultResponse>> {
    const { intervalMs = 5000, timeoutMs = 300000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.getResult(requestId);

      if (!result.ok) {
        return result;
      }

      if (result.status === "READY" && result.result) {
        return result;
      }

      if (result.status === "NOT_READY") {
        if (result.serviceRequestStatus === "rejected") {
          return {
            ok: false,
            error: { code: "REJECTED", message: "Payment request was rejected" },
          };
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }

      // If we get an unexpected status, wait and retry
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return {
      ok: false,
      error: { code: "TIMEOUT", message: "Timed out waiting for result" },
    };
  }

  /**
   * DEMO MODE ONLY: Simulate payment completion without a real blockchain transaction.
   *
   * Only works when AGENTPAY_DEMO_MODE=true on the server.
   * This is for testing/development only - never use in production.
   */
  async completeDemoPayment(requestId: string): Promise<RequestResult<{
    ok: true;
    requestId: string;
    status: string;
    trustedPaymentId: string;
    txHash: string;
  }>> {
    return this.request(`/api/agent/v1/demo/complete-payment`, {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
  }
}