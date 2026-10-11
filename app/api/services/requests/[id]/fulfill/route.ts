import { NextResponse } from "next/server";

import { checkResourceOwnership, requireAuthenticatedSession } from "@/lib/auth";
import { ServiceRequestError, fulfillServiceRequest, getServiceRequest } from "@/lib/services/service";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

/**
 * POST /api/services/requests/[id]/fulfill
 *
 * Attempts to fulfill a service request after payment verification.
 * Requires a trusted payment record to exist for the request.
 *
 * Authentication: when the request has an owner, only the same wallet may
 * trigger fulfillment. Anonymous (demo-flow) requests can be fulfilled by
 * any caller. Authentication is enforced via the session cookie so that
 * the wallet identity comes from the server, not from the request body.
 *
 * Security (Sprint 10):
 *  - Body size cap: 1 KB (this route accepts an empty body).
 *  - Rate limited under SERVICE_FULFILL (20 / minute / identity).
 *  - Same-origin enforced.
 *  - Fulfillment rejection events are logged.
 */
const MAX_BODY_BYTES = 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await guardJsonRequest<Record<string, unknown>>(request, {
    policy: "SERVICE_FULFILL",
    maxBytes: MAX_BODY_BYTES,
  });
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
        detail: `resource=service-fulfill`,
      });
      const response = NextResponse.json(
        { ok: false, error: { code: ownership.code, message: ownership.message } },
        { status: ownership.status },
      );
      applySecurityHeaders(response);
      return response;
    }

    try {
      const { request: fulfilled, result } = await fulfillServiceRequest(id);
      const response = NextResponse.json({ ok: true, request: fulfilled, result });
      applySecurityHeaders(response);
      return response;
    } catch (innerError) {
      if (innerError instanceof ServiceRequestError && innerError.code === "PAYMENT_NOT_VERIFIED") {
        const request = await getServiceRequest(id);
        if (request?.status === "rejected") {
          const response = NextResponse.json(
            { ok: false, error: { code: "REQUEST_REJECTED", message: "Request was rejected before payment verification." } },
            { status: 409 },
          );
          applySecurityHeaders(response);
          return response;
        }
      }
      throw innerError;
    }
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
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The service request could not be fulfilled." } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}
