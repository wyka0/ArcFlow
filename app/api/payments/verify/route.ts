import { NextResponse } from "next/server";

import { getOptionalWallet } from "@/lib/auth";
import { parseVerifyRequest } from "@/lib/payments/server/validation";
import { TrustedLedgerUnavailableError, verifyTrustedPayment } from "@/lib/payments/server/service";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

/**
 * POST /api/payments/verify
 *
 * Accepts only `{ txHash, intentId }`. The server verifies the transaction
 * against Arc before recording it; client-supplied amounts or recipients are
 * ignored because they are never read.
 *
 * Authentication: when the verified intent has an `ownerWalletAddress`, the
 * caller MUST be the same authenticated wallet. Anonymous intents (legacy
 * demo flow) accept any caller.
 *
 * Security (Sprint 10):
 *  - Body size cap: 2 KB (txHash + intentId only).
 *  - Rate limited under PAYMENT_VERIFY (30 / minute / identity).
 *  - Same-origin enforced.
 */
const MAX_BODY_BYTES = 2 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<unknown>(request, {
    policy: "PAYMENT_VERIFY",
    maxBytes: MAX_BODY_BYTES,
  });
  if (!guard.ok) return guard.response;

  const parsed = parseVerifyRequest(guard.body);
  if (!parsed.ok) {
    const response = NextResponse.json(
      { ok: false, error: { code: parsed.code, message: parsed.message } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const authenticatedWallet = await getOptionalWallet(request);

  try {
    const outcome = await verifyTrustedPayment({
      ...parsed.body,
      authenticatedWallet,
    });

    if (outcome.status === "rejected") {
      logSecurityEvent({
        kind: "PAYMENT_VERIFY_REJECTED",
        keyHash: hashKey(guard.identityKey),
        detail: `reason=${outcome.reason}`,
      });
      const status = outcome.reason === "FORBIDDEN" ? 403 : outcome.reason === "UNAUTHENTICATED" ? 401 : 422;
      const response = NextResponse.json(
        { ok: false, error: { code: outcome.reason, message: outcome.message } },
        { status },
      );
      applySecurityHeaders(response);
      return response;
    }

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
      // Fail closed: never imply "no spending" when the ledger is unreachable.
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
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "The payment could not be verified." },
      },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}
