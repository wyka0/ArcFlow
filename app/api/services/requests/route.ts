import { NextResponse } from "next/server";

import { getOptionalWallet } from "@/lib/auth";
import { ServiceRequestError, createServiceRequest } from "@/lib/services/service";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { readStringField } from "@/lib/security/request-body";

/**
 * POST /api/services/requests
 *
 * Creates a new service request and returns the associated payment intent
 * (or the spending info if policy blocks it).
 *
 * Authentication: this route is auth-optional for backward compatibility
 * with the demo flow. When a session is present, the resulting service
 * request is bound to that wallet so only the same wallet can later read
 * the result, attempt fulfillment, or retrieve the trusted payment.
 *
 * Security (Sprint 10):
 *  - Body size cap: 8 KB (the `input` field may include arbitrary service
 *    parameters, but the total request must remain small).
 *  - Rate limited under SERVICE_REQUEST (30 / minute / identity).
 *  - Same-origin enforced.
 */
const MAX_BODY_BYTES = 8 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<Record<string, unknown>>(request, {
    policy: "SERVICE_REQUEST",
    maxBytes: MAX_BODY_BYTES,
  });
  if (!guard.ok) return guard.response;

  const agentField = readStringField(guard.body, "agentId", 128);
  if (!agentField.ok) {
    return NextResponse.json(
      { ok: false, error: { code: agentField.code, message: agentField.message } },
      { status: agentField.status },
    );
  }
  const serviceField = readStringField(guard.body, "serviceId", 128);
  if (!serviceField.ok) {
    return NextResponse.json(
      { ok: false, error: { code: serviceField.code, message: serviceField.message } },
      { status: serviceField.status },
    );
  }
  const input = guard.body.input;
  if (input !== undefined && (typeof input !== "object" || input === null || Array.isArray(input))) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "input must be an object." } },
      { status: 400 },
    );
  }

  const ownerWalletAddress = await getOptionalWallet(request);

  try {
    const { request: serviceRequest, spending } = await createServiceRequest({
      agentId: agentField.value,
      serviceId: serviceField.value,
      input: (input ?? {}) as Record<string, unknown>,
      ownerWalletAddress,
    });

    const response = NextResponse.json({ ok: true, request: serviceRequest, spending });
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
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The service request could not be created." } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}
