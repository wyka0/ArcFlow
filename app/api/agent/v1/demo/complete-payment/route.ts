import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";
import { fulfillServiceRequest, getServiceRequest, recordTransactionHash } from "@/lib/services/service";
import { getTrustedRepository } from "@/lib/payments/server/factory";
import { isDemoModeEnabled, assertDemoMode } from "@/lib/demo-mode";

/**
 * POST /api/agent/v1/demo/complete-payment
 *
 * DEMO MODE ONLY: Simulates payment completion for testing without
 * executing a real Arc blockchain transaction.
 *
 * This endpoint is ONLY available when AGENTPAY_DEMO_MODE=true
 * AND NODE_ENV !== "production".
 *
 * Request:
 * {
 *   "requestId": "req_abc123"
 * }
 *
 * Response:
 * {
 *   "ok": true,
 *   "requestId": "req_abc123",
 *   "status": "payment_confirmed",
 *   "trustedPaymentId": "tpay_demo_123",
 *   "txHash": "0x..."
 * }
 *
 * Security:
 * - Requires AGENTPAY_DEMO_MODE=true
 * - Blocked in production (NODE_ENV=production)
 * - Rate limited under AGENT_REQUEST
 * - Logs security event for audit trail
 */
const MAX_BODY_BYTES = 1024;

export async function POST(request: Request): Promise<NextResponse> {
  // CRITICAL: Enforce demo mode - blocked in production
  try {
    assertDemoMode();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Demo mode not enabled";
    const response = NextResponse.json(
      { ok: false, error: { code: "DEMO_MODE_DISABLED", message } },
      { status: 403 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const guard = await (await import("@/lib/agent/guard")).guardAgentRequest(request, {
    policy: "AGENT_REQUEST",
  });
  if (!guard.ok) return guard.response;

  const agentId = guard.agent.agentId;

  const body = await request.json();
  const requestId = body?.requestId;

  if (!requestId || typeof requestId !== "string") {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "requestId is required" } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  try {
    // Get the service request and verify ownership
    const serviceRequest = await getServiceRequest(requestId);
    if (!serviceRequest) {
      const response = NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Service request not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    if (serviceRequest.agentId !== agentId) {
      logSecurityEvent({
        kind: "OWNERSHIP_REJECTED",
        keyHash: hashKey(`agent:${agentId}`),
        detail: `resource=demo-complete-payment`,
      });
      const response = NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Service request not found." } },
        { status: 404 },
      );
      applySecurityHeaders(response);
      return response;
    }

    if (serviceRequest.status !== "payment_pending" && serviceRequest.status !== "payment_required") {
      const response = NextResponse.json(
        { ok: false, error: { code: "INVALID_STATE", message: `Cannot complete payment in state "${serviceRequest.status}".` } },
        { status: 409 },
      );
      applySecurityHeaders(response);
      return response;
    }

    if (!serviceRequest.paymentIntentId) {
      const response = NextResponse.json(
        { ok: false, error: { code: "NO_PAYMENT_INTENT", message: "No payment intent linked to this request." } },
        { status: 409 },
      );
      applySecurityHeaders(response);
      return response;
    }

    // Generate a demo transaction hash
    const demoTxHash = `0x${"d".repeat(60)}emo${Date.now().toString(16).padStart(8, "0")}` as `0x${string}`;

    // Record the transaction hash
    await recordTransactionHash(requestId, demoTxHash);

    // Create a demo trusted payment record
    const trustedRepo = await getTrustedRepository();
    const demoTrustedPayment = {
      id: `tpay_demo_${Date.now()}`,
      txHash: demoTxHash,
      chainId: 5042,
      tokenAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      agentId: serviceRequest.agentId,
      serviceId: serviceRequest.serviceId,
      serviceName: serviceRequest.serviceName,
      sender: serviceRequest.ownerWalletAddress ?? "0x0000000000000000000000000000000000000000" as `0x${string}`,
      recipient: "0xD682a75B581AA237b5A60aDaefD263Ded0065140" as `0x${string}`,
      amount: { amount: 0.1, currency: "USDC" as const },
      currency: "USDC" as const,
      amountBaseUnits: "100000",
      status: "confirmed" as const,
      blockNumber: "0",
      ownerWalletAddress: serviceRequest.ownerWalletAddress,
      confirmedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      intentId: serviceRequest.paymentIntentId,
    } as const;

    await trustedRepo.insertPayment(demoTrustedPayment);

    // Fulfill the service request
    const { request: fulfilledRequest } = await fulfillServiceRequest(requestId);

    logSecurityEvent({
      kind: "DEMO_PAYMENT_COMPLETED",
      keyHash: hashKey(`agent:${agentId}`),
      detail: `requestId=${requestId} txHash=${demoTxHash}`,
    });

    const response = NextResponse.json({
      ok: true,
      requestId,
      status: "payment_confirmed",
      trustedPaymentId: demoTrustedPayment.id,
      txHash: demoTxHash,
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes("PAYMENT_NOT_VERIFIED")) {
      // This shouldn't happen in demo mode since we just inserted the payment
      const response = NextResponse.json(
        { ok: false, error: { code: "PAYMENT_NOT_VERIFIED", message: "Demo payment verification failed." } },
        { status: 409 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const message = error instanceof Error ? error.message : "Demo payment completion failed.";
    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}