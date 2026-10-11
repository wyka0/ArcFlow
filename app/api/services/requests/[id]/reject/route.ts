import { NextResponse } from "next/server";

import { checkResourceOwnership, requireAuthenticatedSession } from "@/lib/auth";
import { ServiceRequestError, rejectServiceRequest } from "@/lib/services/service";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

/**
 * POST /api/services/requests/:id/reject
 *
 * Rejects a service request that is in a rejectable state.
 *
 * Authentication: requires an authenticated human wallet session.
 *
 * The request must be in a rejectable state:
 * - payment_required
 * - payment_pending
 *
 * And must not have:
 * - a transaction hash (txHash)
 * - a trusted payment ID
 * - already been fulfilled/failed/rejected
 *
 * Authentication: requires an authenticated human wallet session
 * that owns the service request.
 *
 * Request body (optional):
 * {
 *   "reason": "optional rejection reason"
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
 * - 403: Forbidden (not the owner)
 * - 404: Request not found
 * - 409: Request not in a rejectable state (already paid, fulfilled, etc.)
 * - 429: Rate limited
 * - 500: Internal error
 */
const MAX_BODY_BYTES = 1024;

interface RejectRequestBody {
  reason?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await guardJsonRequest<Record<string, unknown>>(request, {
    policy: "SERVICE_FULFILL", // Use same policy as fulfill for similar sensitivity
    maxBytes: 1024,
  });
  if (!guard.ok) return guard.response;

  const bodyResult = await request.json().catch(() => ({}));
  const { reason } = bodyResult as { reason?: string };

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
    const auth = await requireAuthenticatedSession(request);
    if (auth.kind !== "ok") {
      const response = NextResponse.json(
        { ok: false, error: { code: "UNAUTHENTICATED", message: "Authentication required." } },
        { status: 401 },
      );
      applySecurityHeaders(response);
      return response;
    }
    const ownerWalletAddress = auth.session.walletAddress;

    const { getServiceRequest } = await import("@/lib/services/service");
    const serviceRequest = await getServiceRequest(id);
    if (!serviceRequest) {
      const response = NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Service request not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Verify ownership
    if (serviceRequest.ownerWalletAddress?.toLowerCase() !== ownerWalletAddress.toLowerCase()) {
      const response = NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Not authorized to reject this request." } },
        { status: 403 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const rejectedRequest = await rejectServiceRequest(id, serviceRequest.ownerWalletAddress as `0x${string}`, reason);

    logSecurityEvent({
      kind: "SERVICE_REQUEST_REJECTED",
      keyHash: "request",
      detail: `requestId=${id} reason=${reason ?? "none"}`,
    });

    const response = NextResponse.json({
      ok: true,
      request: rejectedRequest,
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof ServiceRequestError) {
      const status = error.statusCode === 404 ? 404 : error.statusCode === 403 ? 403 : error.statusCode === 409 ? 409 : 400;
      const response = NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status },
      );
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The request could not be rejected." } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}