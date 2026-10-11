import { NextResponse } from "next/server";

import { applySecurityHeaders, guardReadRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";
import { getServiceRequest } from "@/lib/services/service";
import { getTrustedRepository } from "@/lib/payments/server/factory";
import { getOptionalWallet } from "@/lib/auth";

/**
 * GET /api/agent/v1/requests/:id/intent
 *
 * Returns the full payment intent details for a service request.
 * Used by the human wallet owner to approve the payment.
 *
 * Authentication: requires an authenticated human wallet session.
 * The wallet must own the service request.
 *
 * Response (200):
 * {
 *   "ok": true,
 *   "intent": {
 *     "id": "...",
 *     "recipient": "0x...",
 *     "chainId": 5042,
 *     "tokenAddress": "0x...",
 *     "amount": { "amount": 0.1, "currency": "USDC" },
 *     "currency": "USDC",
 *     "expiresAt": "...",
 *     "status": "pending"
 *   }
 * }
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Require human wallet authentication
  const ownerWalletAddress = await getOptionalWallet(request);
  if (!ownerWalletAddress) {
    const response = NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Human wallet authentication required." } },
      { status: 401 },
    );
    applySecurityHeaders(response);
    return response;
  }

  // Rate limit
  const guard = await guardReadRequest(request, { policy: "AGENT_STATUS" });
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

    // Check ownership - wallet must own the request
    if (serviceRequest.ownerWalletAddress?.toLowerCase() !== ownerWalletAddress.toLowerCase()) {
      logSecurityEvent({
        kind: "OWNERSHIP_REJECTED",
        keyHash: hashKey(ownerWalletAddress),
        detail: `resource=agent-intent`,
      });
      const response = NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Service request not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    if (!serviceRequest.paymentIntentId) {
      const response = NextResponse.json(
        { ok: false, error: { code: "NO_INTENT", message: "No payment intent linked to this request." } },
        { status: 400 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Fetch the payment intent from the trusted ledger
    const trustedRepo = await getTrustedRepository();
    const intent = await trustedRepo.getIntent(serviceRequest.paymentIntentId);

    if (!intent) {
      const response = NextResponse.json(
        { ok: false, error: { code: "INTENT_NOT_FOUND", message: "Payment intent not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Return the full payment intent details
    const response = NextResponse.json({
      ok: true,
      intent: {
        id: intent.id,
        recipient: intent.recipient,
        chainId: intent.chainId,
        tokenAddress: intent.tokenAddress,
        amount: intent.amount,
        currency: intent.currency,
        expiresAt: intent.expiresAt,
        status: intent.status,
      },
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The payment intent could not be retrieved.";
    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}