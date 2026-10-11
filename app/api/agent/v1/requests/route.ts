import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";
import { readStringField, readObjectField } from "@/lib/security/request-body";
import { getService } from "@/lib/services/registry";
import { createPaymentIntent } from "@/lib/payments/server/service";
import { createServiceRequest } from "@/lib/services/service";
import { parseIntentRequest } from "@/lib/payments/server/validation";
import { guardAgentRequest } from "@/lib/agent/guard";

/**
 * POST /api/agent/v1/requests
 *
 * Creates a new service request from an authenticated external agent.
 *
 * Authentication: Authorization: Bearer <agent-api-key>
 *
 * Request:
 * {
 *   "serviceId": "market-data",
 *   "input": { "symbol": "BTC", "timeframe": "24h" },
 *   "idempotencyKey": "optional-client-key"
 * }
 *
 * The server determines all payment parameters (recipient, amount, chain, etc.)
 * based on the service and policy. The agent CANNOT control these.
 *
 * Response (201):
 * {
 *   "ok": true,
 *   "requestId": "...",
 *   "status": "payment_required",
 *   "payment": {
 *     "intentId": "...",
 *     "amount": "...",
 *     "currency": "USDC",
 *     "recipient": "...",
 *     "chainId": 5042,
 *     "expiresAt": "..."
 *   }
 * }
 *
 * Error responses:
 * 401 AGENT_UNAUTHORIZED
 * 404 SERVICE_NOT_FOUND
 * 422 INVALID_SERVICE_INPUT
 * 409 IDEMPOTENCY_CONFLICT / POLICY_BLOCKED
 * 429 RATE_LIMITED
 * 503 LEDGER_UNAVAILABLE
 */

export async function POST(request: Request): Promise<NextResponse> {
  // Use agent guard which handles auth + rate limiting
  const guard = await guardAgentRequest(request, { policy: "AGENT_REQUEST" });
  if (!guard.ok) return guard.response;

  const agentId = guard.agent.agentId;
  const ownerWalletAddress = guard.agent.ownerWalletAddress;

  // Read idempotency key from header
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;

  // Parse body (guard does NOT consume body - only reads headers)
  const body = await request.json();

  const serviceField = readStringField(body, "serviceId", 128);
  if (!serviceField.ok) {
    const response = NextResponse.json(
      { ok: false, error: { code: serviceField.code, message: serviceField.message } },
      { status: serviceField.status },
    );
    applySecurityHeaders(response);
    return response;
  }

  const inputField = readObjectField(body, "input");
  if (!inputField.ok) {
    const response = NextResponse.json(
      { ok: false, error: { code: inputField.code, message: inputField.message } },
      { status: inputField.status },
    );
    applySecurityHeaders(response);
    return response;
  }

  // Validate service exists and is active
  const service = getService(serviceField.value);
  if (!service) {
    const response = NextResponse.json(
      { ok: false, error: { code: "SERVICE_NOT_FOUND", message: `Service "${serviceField.value}" not found.` } },
      { status: 404 },
    );
    applySecurityHeaders(response);
    return response;
  }
  if (!service.active) {
    const response = NextResponse.json(
      { ok: false, error: { code: "SERVICE_INACTIVE", message: `Service "${service.name}" is not active.` } },
      { status: 422 },
    );
    applySecurityHeaders(response);
    return response;
  }

  // Create the service request (includes policy check)
  try {
    const { request: serviceRequest, spending } = await createServiceRequest({
      agentId,
      serviceId: service.id,
      input: inputField.value as Record<string, unknown>,
      ownerWalletAddress,
      idempotencyKey,
    });

    // If idempotency key was provided and request already existed,
    // check if it already has a payment intent
    if (idempotencyKey && serviceRequest.paymentIntentId) {
      // Need to fetch the intent to return payment details
      const { getTrustedRepository } = await import("@/lib/payments/server/factory");
      const trustedRepo = await getTrustedRepository();
      const intent = await trustedRepo.getIntent(serviceRequest.paymentIntentId);
      if (intent) {
        logSecurityEvent({
          kind: "AGENT_SERVICE_REQUEST_IDEMPOTENT",
          keyHash: hashKey(`agent:${agentId}`),
          detail: `requestId=${serviceRequest.id}`,
        });
        const response = NextResponse.json(
          {
            ok: true,
            requestId: serviceRequest.id,
            status: serviceRequest.status,
            payment: {
              intentId: intent.id,
              amount: intent.amount,
              currency: intent.currency,
              recipient: intent.recipient,
              chainId: intent.chainId,
              tokenAddress: intent.tokenAddress,
              expiresAt: intent.expiresAt,
            },
            spending,
          },
          { status: 200 }, // 200 for existing request
        );
        applySecurityHeaders(response);
        return response;
      }
    }

    // Create payment intent
    const intentRequest = {
      agentId,
      serviceId: service.id,
      sender: ownerWalletAddress,
    };

    const parsed = parseIntentRequest(intentRequest);
    if (!parsed.ok) {
      const response = NextResponse.json(
        { ok: false, error: { code: parsed.code, message: parsed.message } },
        { status: 400 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const outcome = await createPaymentIntent({
      ...parsed.body,
      ownerWalletAddress,
    });

    if (outcome.status === "blocked") {
      logSecurityEvent({
        kind: "PAYMENT_INTENT_REJECTED",
        keyHash: hashKey(`agent:${agentId}`),
        detail: `reason=${outcome.kind}`,
      });
      const response = NextResponse.json(
        {
          ok: false,
          error: {
            code: "POLICY_BLOCKED",
            message: outcome.reason,
            kind: outcome.kind,
            violations: outcome.violations,
          },
          spending: outcome.spending,
        },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const intent = outcome.intent;

    // Link payment intent to service request
    const { linkPaymentIntent } = await import("@/lib/services/service");
    await linkPaymentIntent(serviceRequest.id, intent.id);

    logSecurityEvent({
      kind: "AGENT_SERVICE_REQUEST_CREATED",
      keyHash: hashKey(`agent:${agentId}`),
      detail: `requestId=${serviceRequest.id} serviceId=${service.id}`,
    });

    const response = NextResponse.json(
      {
        ok: true,
        requestId: serviceRequest.id,
        status: "payment_required",
        payment: {
          intentId: intent.id,
          amount: intent.amount,
          currency: intent.currency,
          recipient: intent.recipient,
          chainId: intent.chainId,
          tokenAddress: intent.tokenAddress,
          expiresAt: intent.expiresAt,
        },
        spending: outcome.spending,
      },
      { status: 201 },
    );
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes("LEDGER_UNAVAILABLE")) {
      const response = NextResponse.json(
        {
          ok: false,
          error: { code: "LEDGER_UNAVAILABLE", message: "Unable to verify the current spending limit. The request was blocked." },
        },
        { status: 503 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const message = error instanceof Error ? error.message : "The service request could not be created.";
    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}