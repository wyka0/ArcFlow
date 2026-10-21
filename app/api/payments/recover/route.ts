import { NextResponse } from "next/server";

import { getOptionalWallet } from "@/lib/auth";
import {
  TrustedLedgerUnavailableError,
  recoverTrustedPayment,
} from "@/lib/payments/server/service";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

/**
 * POST /api/payments/recover
 *
 * Recovery endpoint for expired payment intents where a valid transaction
 * was submitted on-chain before the intent expired, but verification was
 * not completed before the intent expired.
 *
 * This endpoint:
 * - Requires authenticated owner wallet (the intent must be owned by the
 *   session wallet — Phase 51.2, L3: ownerless intents cannot be recovered
 *   and ownerless payment records are never disclosed, because a transaction
 *   hash is public data and proves nothing about ownership)
 * - Verifies the transaction independently on Arc Mainnet
 * - Checks the transaction exactly matches the expired intent
 * - Records the payment and consumes the intent through the shared atomic
 *   settlement operation (Phase 51.2, L4) — exactly one payment can settle
 *   an intent, and a payment never persists without its intent being consumed
 *
 * This does NOT create a new blockchain transaction.
 *
 * Request:
 * {
 *   "intentId": "pay_...",
 *   "txHash": "0x...",
 *   "requestId": "pay_..." (optional, for additional validation)
 * }
 *
 * Response (200):
 * {
 *   "ok": true,
 *   "alreadyRecorded": false,
 *   "record": { ... },
 *   "spending": { ... }
 * }
 *
 * Errors:
 * - 400: Invalid request / request-id mismatch
 * - 401: Unauthenticated
 * - 403: Forbidden (different owner, or ownerless intent: OWNER_REQUIRED)
 * - 404: Intent not found
 * - 422: Verification failed (wrong chain, amount, recipient, etc.) or the
 *        intent was already settled by a different transaction
 * - 503: Ledger unavailable
 * - 500: Internal error
 */
const MAX_BODY_BYTES = 2 * 1024;

/** HTTP status for each typed rejection reason; unmapped reasons get 422. */
const STATUS_BY_REASON: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  OWNER_REQUIRED: 403,
  INTENT_NOT_FOUND: 404,
  REQUEST_MISMATCH: 400,
  INTENT_ALREADY_SETTLED: 422,
  VERIFICATION_MISMATCH: 422,
};

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<unknown>(request, {
    policy: "PAYMENT_VERIFY",
    maxBytes: MAX_BODY_BYTES,
  });
  if (!guard.ok) return guard.response;

  const body = guard.body as { intentId?: unknown; txHash?: unknown; requestId?: unknown };

  if (typeof body.intentId !== "string" || !/^pay_[A-Za-z0-9_-]+$/.test(body.intentId)) {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_INTENT_ID", message: "Invalid or missing intentId." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  if (typeof body.txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(body.txHash)) {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_TX_HASH", message: "Invalid or missing txHash." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  if (
    body.requestId !== undefined &&
    (typeof body.requestId !== "string" || !/^pay_[A-Za-z0-9_-]+$/.test(body.requestId))
  ) {
    const response = NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST_ID", message: "Invalid requestId." } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const authenticatedWallet = await getOptionalWallet(request);
  if (!authenticatedWallet) {
    const response = NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Authentication required." } },
      { status: 401 },
    );
    applySecurityHeaders(response);
    return response;
  }

  // Optional request-id cross-check: the referenced service request must
  // point at this intent. Kept at the route because it validates request
  // shape against the services domain (Phase 51.2 — the ownership, expiry,
  // verification, and settlement logic moved to the shared service).
  if (body.requestId !== undefined) {
    const { getServiceRequest } = await import("@/lib/services/service");
    const serviceRequest = await getServiceRequest(body.requestId);
    if (!serviceRequest || serviceRequest.paymentIntentId !== body.intentId) {
      const response = NextResponse.json(
        { ok: false, error: { code: "REQUEST_MISMATCH", message: "Provided requestId does not match intent." } },
        { status: 400 },
      );
      applySecurityHeaders(response);
      return response;
    }
  }

  try {
    const outcome = await recoverTrustedPayment({
      intentId: body.intentId,
      txHash: body.txHash as `0x${string}`,
      authenticatedWallet,
    });

    if (outcome.status === "rejected") {
      logSecurityEvent({
        kind: "PAYMENT_VERIFY_REJECTED",
        keyHash: hashKey(authenticatedWallet),
        detail: `intentId=${body.intentId} reason=${outcome.reason}`,
      });
      const status = STATUS_BY_REASON[outcome.reason] ?? 422;
      const response = NextResponse.json(
        { ok: false, error: { code: outcome.reason, message: outcome.message } },
        { status },
      );
      applySecurityHeaders(response);
      return response;
    }

    logSecurityEvent({
      kind: "PAYMENT_VERIFIED",
      keyHash: hashKey(authenticatedWallet),
      detail: `intentId=${body.intentId} txHash=${body.txHash} recovery=true`,
    });

    const response = NextResponse.json({
      ok: true,
      alreadyRecorded: outcome.alreadyRecorded,
      record: outcome.record,
      spending: outcome.spending,
    });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof TrustedLedgerUnavailableError) {
      const response = NextResponse.json(
        {
          ok: false,
          error: {
            code: "LEDGER_UNAVAILABLE",
            message: "The trusted payment ledger is unavailable.",
          },
        },
        { status: 503 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "The payment could not be recovered." } },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}
