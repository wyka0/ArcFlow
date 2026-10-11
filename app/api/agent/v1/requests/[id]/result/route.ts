import { NextResponse } from "next/server";

import { applySecurityHeaders, guardReadRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";
import { getServiceRequest, getServiceResult } from "@/lib/services/service";
import { authenticateAgent } from "@/lib/agent/auth";

/**
 * GET /api/agent/v1/requests/:id/result
 *
 * Retrieves the service result for a completed request.
 *
 * Authentication: Authorization: Bearer <agent-api-key>
 *
 * Only returns result when:
 *  - trusted payment exists
 *  - fulfillment has completed
 *
 * The agent can only access results for requests belonging to that agent.
 *
 * Response (200):
 * {
 *   "ok": true,
 *   "status": "READY",
 *   "requestId": "...",
 *   "result": {
 *     "id": "...",
 *     "serviceId": "...",
 *     "status": "fulfilled",
 *     "output": { ... },
 *     "trustedPaymentId": "...",
 *     "fulfilledAt": "..."
 *   }
 * }
 *
 * If not ready:
 * {
 *   "ok": true,
 *   "status": "NOT_READY",
 *   "requestId": "...",
 *   "serviceRequestStatus": "..."
 * }
 *
 * Error responses:
 * 401 AGENT_UNAUTHORIZED
 * 404 REQUEST_NOT_FOUND
 * 403 AGENT_FORBIDDEN
 * 429 RATE_LIMITED
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await guardReadRequest(request, { policy: "AGENT_RESULT" });
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

    // Check ownership
    if (serviceRequest.agentId !== agentId) {
      logSecurityEvent({
        kind: "OWNERSHIP_REJECTED",
        keyHash: hashKey(`agent:${agentId}`),
        detail: `resource=agent-result`,
      });
      const response = NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Service request not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // If request is not in a terminal state, fulfillment is not ready
    if (serviceRequest.status !== "fulfilled" && serviceRequest.status !== "failed") {
      const response = NextResponse.json({
        ok: true,
        status: serviceRequest.status === "rejected" ? "REJECTED" : "NOT_READY",
        requestId: serviceRequest.id,
        serviceRequestStatus: serviceRequest.status,
      });
      applySecurityHeaders(response);
      return response;
    }

    // Request is fulfilled or failed - retrieve the result
    const result = await getServiceResult(id);
    if (!result) {
      const response = NextResponse.json({
        ok: true,
        status: "NOT_READY",
        requestId: serviceRequest.id,
        serviceRequestStatus: serviceRequest.status,
      });
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.json({
      ok: true,
      status: "READY",
      requestId: serviceRequest.id,
      result: {
        id: result.id,
        requestId: result.requestId,
        serviceId: result.serviceId,
        status: result.status,
        output: result.output,
        error: result.error,
        trustedPaymentId: result.trustedPaymentId,
        fulfilledAt: result.fulfilledAt,
        createdAt: result.createdAt,
      },
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The service result could not be retrieved.";
    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}