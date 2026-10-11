import { NextResponse } from "next/server";

import { applySecurityHeaders, guardReadRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";
import { getServiceRequest } from "@/lib/services/service";
import { authenticateAgent } from "@/lib/agent/auth";

/**
 * GET /api/agent/v1/requests/:id
 *
 * Retrieves the status of an agent's service request.
 *
 * Authentication: Authorization: Bearer <agent-api-key>
 *
 * The agent can only access requests belonging to that authenticated agent.
 *
 * Response (200):
 * {
 *   "ok": true,
 *   "requestId": "...",
 *   "status": "payment_required",
 *   "payment": { "intentId": "...", "amount": "...", ... },
 *   "serviceId": "...",
 *   "serviceName": "...",
 *   "createdAt": "...",
 *   "updatedAt": "..."
 * }
 *
 * Error responses:
 * 401 AGENT_UNAUTHORIZED
 * 404 REQUEST_NOT_FOUND
 * 403 AGENT_FORBIDDEN (request belongs to different agent)
 * 429 RATE_LIMITED
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await guardReadRequest(request, { policy: "AGENT_STATUS" });
  if (!guard.ok) return guard.response;

  const authResult = await authenticateAgent(request);
  if (!authResult.ok) {
    const status = authResult.code === "MISSING_AUTHORIZATION" || authResult.code === "MALFORMED_AUTHORIZATION" ? 401 : 403;
    const response = NextResponse.json(
      { ok: false, error: { code: `AGENT_${authResult.code}`, message: authResult.message } },
      { status },
    );
    applySecurityHeaders(response);
    return response;
  }

  const agentId = authResult.agent.agentId;
  const { id } = await params;

  if (!id || typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id) || id.length > 128) {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_ID", message: "Invalid request ID." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  try {
    const serviceRequest = await getServiceRequest(id);

    if (!serviceRequest) {
      const response = NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Service request not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Check ownership - agent can only access its own requests
    if (serviceRequest.agentId !== agentId) {
      logSecurityEvent({
        kind: "OWNERSHIP_REJECTED",
        keyHash: hashKey(`agent:${agentId}`),
        detail: `resource=agent-request`,
      });
      const response = NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Service request not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const responseBody: Record<string, unknown> = {
      ok: true,
      requestId: serviceRequest.id,
      status: serviceRequest.status,
      serviceId: serviceRequest.serviceId,
      serviceName: serviceRequest.serviceName,
      createdAt: serviceRequest.createdAt,
      updatedAt: serviceRequest.updatedAt,
    };

    // Include payment info if available
    if (serviceRequest.paymentIntentId) {
      responseBody.payment = {
        intentId: serviceRequest.paymentIntentId,
      };
    }

    if (serviceRequest.trustedPaymentId) {
      responseBody.payment = {
        ...(responseBody.payment as Record<string, unknown>),
        trustedPaymentId: serviceRequest.trustedPaymentId,
      };
    }

    if (serviceRequest.txHash) {
      responseBody.payment = {
        ...(responseBody.payment as Record<string, unknown>),
        txHash: serviceRequest.txHash,
      };
    }

    if (serviceRequest.error) {
      responseBody.error = serviceRequest.error;
    }

    const response = NextResponse.json(responseBody);
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The service request could not be retrieved.";
    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}