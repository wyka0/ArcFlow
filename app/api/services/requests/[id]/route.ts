import { NextResponse } from "next/server";

import { checkResourceOwnership, requireAuthenticatedSession } from "@/lib/auth";
import { ServiceRequestError, getServiceRequest } from "@/lib/services/service";
import { applySecurityHeaders, guardReadRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

/**
 * GET /api/services/requests/[id]
 *
 * Returns the current state of a service request.
 *
 * Authentication: when the request has an owner (created by an
 * authenticated caller), the caller MUST be the same wallet. Anonymous
 * (demo-flow) requests are readable by anyone.
 *
 * Security (Sprint 10):
 *  - Rate limited under SERVICE_RESULT (60 / minute / identity).
 *  - Ownership rejections are logged with a hashed identity only.
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

    const auth = await requireAuthenticatedSession(request);
    const ownership = checkResourceOwnership(serviceRequest.ownerWalletAddress, auth);
    if (!ownership.ok) {
      logSecurityEvent({
        kind: "OWNERSHIP_REJECTED",
        keyHash: hashKey(guard.identityKey),
        detail: `resource=service-request`,
      });
      const response = NextResponse.json(
        { ok: false, error: { code: ownership.code, message: ownership.message } },
        { status: ownership.status },
      );
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.json({ ok: true, request: serviceRequest });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof ServiceRequestError) {
      const response = NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode },
      );
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The service request could not be retrieved." } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}
