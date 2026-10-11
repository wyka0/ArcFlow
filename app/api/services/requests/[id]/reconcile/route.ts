import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { guardAgentRequest } from "@/lib/agent/guard";

import { getTrustedRepository } from "@/lib/payments/server/factory";
import { createPostgresServiceRequestRepository } from "@/lib/services/postgres";
import { ServiceRequestError } from "@/lib/services/service";
import { TrustedLedgerUnavailableError } from "@/lib/payments/server/service";

import type { ServiceRequest, ServiceRequestStatus } from "@/types/service-request";

/**
 * POST /api/services/requests/:id/reconcile
 *
 * Reconciles a service request that has an inconsistent state.
 * Specifically, restores a request that was incorrectly rejected
 * when it has a confirmed trusted payment.
 *
 * This is a reconciliation endpoint for operational recovery.
 *
 * Authentication: requires valid agent API key (owner of the request).
 *
 * Request body:
 * {
 *   "expectedStatus": "payment_confirmed" (required)
 * }
 *
 * Response (200):
 * {
 *   "ok": true,
 *   "request": { ... }
 * }
 *
 * Errors:
 * - 400: Invalid request
 * - 401: Unauthenticated
 * - 403: Forbidden (different owner)
 * - 404: Request not found
 * - 422: Cannot reconcile (no matching trusted payment, wrong state, etc.)
 * - 503: Ledger unavailable
 * - 500: Internal error
 */
const MAX_BODY_BYTES = 1024;

interface ReconcilePayload {
  expectedStatus: "payment_confirmed";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Use agent authentication (API key)
  const agentGuard = await guardAgentRequest(request, {
    policy: "AGENT_REQUEST",
  });
  if (!agentGuard.ok) return agentGuard.response;

  const { expectedStatus } = await request.json();
  if (expectedStatus !== "payment_confirmed") {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_STATUS", message: "Only payment_confirmed is supported for reconciliation." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const { id } = await params;

  if (!id || typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id) || id.length > 128) {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_ID", message: "Invalid request ID." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const authenticatedWallet = agentGuard.agent.ownerWalletAddress;

  try {
    const repository = createPostgresServiceRequestRepository(process.env.DATABASE_URL!);

    // Get the request
    const serviceRequest = await repository.getById(id);
    if (!serviceRequest) {
      const response = NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Service request not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Ownership check - agent must own the request
    if (serviceRequest.ownerWalletAddress?.toLowerCase() !== authenticatedWallet.toLowerCase()) {
      const response = NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "You are not authorised to reconcile this request." } },
        { status: 403 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Check current state
    if (serviceRequest.status !== "rejected") {
      const response = NextResponse.json(
        { ok: false, error: { code: "INVALID_STATE", message: `Cannot reconcile request in state "${serviceRequest.status}". Only rejected requests can be reconciled.` } },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Verify there's a confirmed trusted payment for this intent
    const trustedRepo = await getTrustedRepository();
    if (!serviceRequest.paymentIntentId) {
      const response = NextResponse.json(
        { ok: false, error: { code: "NO_INTENT", message: "Request has no payment intent." } },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const intent = await trustedRepo.getIntent(serviceRequest.paymentIntentId);
    if (!intent) {
      const response = NextResponse.json(
        { ok: false, error: { code: "INTENT_NOT_FOUND", message: "Payment intent not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    if (intent.status !== "consumed" && intent.status !== "pending") {
      const response = NextResponse.json(
        { ok: false, error: { code: "INTENT_INVALID", message: "Payment intent is not in a consumable state." } },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Check for confirmed trusted payment - use multiple lookup strategies
    let existingPayment = await trustedRepo.findByIntentId(serviceRequest.paymentIntentId);

    // Fallback: direct query using service request's agentId and serviceId
    // This handles cases where intent_id is NULL or intent agent_id/service_id don't match
    if (!existingPayment || existingPayment.status !== "confirmed") {
      if (typeof trustedRepo.findConfirmedPaymentForRequest === "function") {
        // Use intent's recipient for the query, not the service request's owner wallet
        existingPayment = await trustedRepo.findConfirmedPaymentForRequest(
          serviceRequest.agentId,
          serviceRequest.serviceId,
          intent.recipient,
          intent.amount.amount,
          intent.currency
        );
      }
    }

    if (!existingPayment || existingPayment.status !== "confirmed") {
      const response = NextResponse.json(
        { ok: false, error: { code: "NO_CONFIRMED_PAYMENT", message: "No confirmed trusted payment found for this intent." } },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Verify the trusted payment matches the original intent
    const trustedPayment = existingPayment;
    if (
      trustedPayment.recipient.toLowerCase() !== intent.recipient.toLowerCase() ||
      trustedPayment.amount.amount !== intent.amount.amount ||
      trustedPayment.currency !== intent.currency
    ) {
      const response = NextResponse.json(
        { ok: false, error: { code: "PAYMENT_MISMATCH", message: "Trusted payment does not match expected values." } },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Update request to payment_confirmed state
    const now = new Date().toISOString();
    const updatedRequest: ServiceRequest = {
      ...serviceRequest,
      status: "payment_confirmed" as ServiceRequestStatus,
      error: null,
      updatedAt: new Date().toISOString(),
      txHash: trustedPayment.txHash,
      trustedPaymentId: trustedPayment.id,
    };

    await repository.update(updatedRequest);

    logSecurityEvent({
      kind: "SERVICE_REQUEST_RECONCILED",
      keyHash: agentGuard.identityKey,
      detail: `requestId=${id} intentId=${serviceRequest.paymentIntentId} trustedPaymentId=${trustedPayment.id}`,
    });

    const response = NextResponse.json({
      ok: true,
      request: updatedRequest,
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof TrustedLedgerUnavailableError) {
      const response = NextResponse.json(
        {
          ok: false,
          error: {
            code: "LEDGER_UNAVAILABLE",
            message: "The trusted payment ledger is unavailable.",
          },
        },
        { status: 503 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The request could not be reconciled." } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}