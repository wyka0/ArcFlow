import { NextResponse } from "next/server";

import { requireAuthenticatedSession } from "@/lib/auth";
import { TrustedLedgerUnavailableError, getTrustedHistory } from "@/lib/payments/server/service";
import { getTrustedRepository } from "@/lib/payments/server/factory";
import { applySecurityHeaders, guardReadRequest } from "@/lib/security";

/**
 * GET /api/payments/history
 *
 * Returns trusted records owned by the authenticated wallet plus the
 * spending summary derived from them. Unauthenticated callers receive a
 * 401 — this endpoint is user-scoped, so it is not safe to expose
 * anonymous views.
 *
 * `persistence.durable` tells the client whether the ledger survives
 * restarts.
 *
 * Security (Sprint 10):
 *  - Rate limited under PAYMENT_HISTORY (60 / minute / identity).
 *  - Origin validation not strictly required for GET, but we enforce
 *    it to keep the attack surface small.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const guard = await guardReadRequest(request, { policy: "PAYMENT_HISTORY" });
  if (!guard.ok) return guard.response;

  const auth = await requireAuthenticatedSession(request);
  if (auth.kind === "missing") {
    const response = NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to view your payment history." } },
      { status: 401 },
    );
    applySecurityHeaders(response);
    return response;
  }

  try {
    const { records, spending } = await getTrustedHistory({
      ownerWalletAddress: auth.session.walletAddress,
    });
    const repository = await getTrustedRepository();

    const response = NextResponse.json({
      ok: true,
      records,
      spending,
      persistence: repository.persistence,
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
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "The ledger could not be read." },
      },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}
