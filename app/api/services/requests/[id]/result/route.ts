import { NextResponse } from "next/server";

import { checkResourceOwnership, requireAuthenticatedSession } from "@/lib/auth";
import { getServiceRequest, getServiceResult } from "@/lib/services/service";
import { applySecurityHeaders, guardReadRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

/**
 * GET /api/services/requests/[id]/result
 *
 * Returns the ServiceResult for a completed (fulfilled or failed) service
 * request, or a NOT_READY response if fulfillment has not completed.
 *
 * Authentication is REQUIRED. The caller MUST be the wallet that owns the
 * service request. We deliberately collapse "not found" and "not yours"
 * for owned resources into a 404 to avoid leaking the existence of other
 * users' requests; for legacy anonymous (demo-flow) requests the result
 * is also gated by an authenticated session so private outputs are never
 * publicly accessible.
 *
 * Security (Sprint 10):
 *  - Rate limited under SERVICE_RESULT (60 / minute / identity).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await guardReadRequest(request, { policy: "SERVICE_RESULT" });
  if (!guard.ok) return guard.response;

  const { id } = await params;

  if (!id || typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id) || id.length > 128) {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_ID", message: "Invalid request ID." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const auth = await requireAuthenticatedSession(request);
  if (auth.kind === "missing") {
    const response = NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to retrieve the service result." } },
      { status: 401 },
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

    const ownership = checkResourceOwnership(serviceRequest.ownerWalletAddress, auth);
    if (!ownership.ok) {
      logSecurityEvent({
        kind: "OWNERSHIP_REJECTED",
        keyHash: hashKey(guard.identityKey),
        detail: `resource=service-result`,
      });
      // Do not leak existence: return 404 rather than 403 for owned resources.
      const status = serviceRequest.ownerWalletAddress ? 404 : ownership.status;
      const code = serviceRequest.ownerWalletAddress ? "NOT_FOUND" : ownership.code;
      const response = NextResponse.json(
        { ok: false, error: { code, message: "Service request not found." } },
        { status },
      );
      applySecurityHeaders(response);
      return response;
    }

    // If request is not in a terminal state, fulfillment is not ready.
    if (serviceRequest.status !== "fulfilled" && serviceRequest.status !== "failed") {
      const response = NextResponse.json({
        ok: true,
        status: "NOT_READY",
        requestId: serviceRequest.id,
        serviceRequestStatus: serviceRequest.status,
      });
      applySecurityHeaders(response);
      return response;
    }

    // Request is fulfilled or failed - retrieve the result.
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
      serviceRequestStatus: serviceRequest.status,
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
  } catch {
    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The service result could not be retrieved." } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}
