import { NextResponse } from "next/server";

import { applySecurityHeaders, guardReadRequest } from "@/lib/security";
import { listServiceRequests } from "@/lib/services/service";
import { getService } from "@/lib/services/registry";
import { getOptionalWallet } from "@/lib/auth";
import { getPolicy, consumeRateLimit } from "@/lib/security/rate-limit";

/**
 * GET /api/agent/v1/pending
 *
 * Returns pending agent payment requests for the authenticated human wallet owner.
 *
 * Authentication: requires an authenticated human wallet session.
 *
 * Response (200):
 * {
 *   "ok": true,
 *   "requests": [
 *     {
 *       "id": "...",
 *       "agentName": "...",
 *       "serviceName": "...",
 *       "serviceCategory": "...",
 *       "amount": 0.10,
 *       "currency": "USDC",
 *       "status": "payment_required",
 *       "intentId": "...",
 *       "createdAt": "...",
 *       "ownerWalletAddress": "..."
 *     }
 *   ]
 * }
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Use agent guard for rate limiting by authenticated wallet
  const guard = await guardReadRequest(request, { policy: "AGENT_PENDING" });
  if (!guard.ok) return guard.response;

  // Rate limit by wallet identity
  const identityKey = `wallet:${guard.identityKey}`;
  const decision = consumeRateLimit({
    key: identityKey,
    policy: getPolicy("AGENT_PENDING"),
    requestId: request.headers.get("x-request-id") ?? undefined,
  });
  if (!decision.ok) {
    const { logSecurityEvent } = await import("@/lib/security/logger");
    const { hashKey } = await import("@/lib/security/rate-limit");
    logSecurityEvent({
      kind: "RATE_LIMITED",
      keyHash: hashKey(identityKey),
      policy: decision.policy.name,
    });
    const response = NextResponse.json(
      { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests. Slow down and try again shortly." } },
      { status: 429 },
    );
    response.headers.set("Retry-After", Math.ceil(decision.retryAfterMs / 1000).toString());
    applySecurityHeaders(response);
    return response;
  }

  const ownerWalletAddress = await getOptionalWallet(request);
  if (!ownerWalletAddress) {
    const response = NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Human wallet authentication required." } },
      { status: 401 },
    );
    applySecurityHeaders(response);
    return response;
  }

  try {
    const allRequests = await listServiceRequests();

    // Filter requests owned by this wallet that are in payment states
    const pendingRequests = allRequests
      .filter((req) => {
        if (req.ownerWalletAddress?.toLowerCase() !== ownerWalletAddress.toLowerCase()) return false;
        return ["payment_required", "payment_pending", "payment_confirmed"].includes(req.status);
      })
      .map((req) => {
        const service = getService(req.serviceId);
        return {
          id: req.id,
          agentName: req.agentId,
          serviceName: req.serviceName,
          serviceCategory: service?.category ?? "unknown",
          amount: service?.price ?? 0,
          currency: service?.currency ?? "USDC",
          status: req.status,
          intentId: req.paymentIntentId,
          createdAt: req.createdAt,
          ownerWalletAddress: req.ownerWalletAddress ?? "unknown",
        };
      });

    const response = NextResponse.json({ ok: true, requests: pendingRequests });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list pending requests.";
    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}