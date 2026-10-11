import { NextResponse } from "next/server";

import { getOptionalWallet } from "@/lib/auth";
import { TrustedLedgerUnavailableError, createPaymentIntent } from "@/lib/payments/server/service";
import { parseIntentRequest } from "@/lib/payments/server/validation";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

/**
 * POST /api/payments/intents
 *
 * Creates an approved payment intent. The server decides the amount, recipient,
 * token, and chain — the client supplies only the agent, service, and its own
 * wallet address. Fails closed when the trusted ledger is unavailable.
 *
 * Authentication: this route is auth-optional for backward compatibility with
 * the demo flow, but when a session cookie is present, the resulting intent
 * is bound to that session's wallet so only the same wallet can later verify
 * it. Unauthenticated calls produce ownerless intents (legacy demo flow).
 *
 * Security (Sprint 10):
 *  - Body size cap: 4 KB.
 *  - Rate limited under PAYMENT_INTENT (30 / minute / identity).
 *  - Same-origin enforced.
 */
const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<unknown>(request, {
    policy: "PAYMENT_INTENT",
    maxBytes: MAX_BODY_BYTES,
  });
  if (!guard.ok) return guard.response;

  const parsed = parseIntentRequest(guard.body);
  if (!parsed.ok) {
    const response = NextResponse.json(
      { ok: false, error: { code: parsed.code, message: parsed.message } },
      { status: 400 },
    );
    applySecurityHeaders(response);
    return response;
  }

  const ownerWalletAddress = await getOptionalWallet(request);

  try {
    const outcome = await createPaymentIntent({
      ...parsed.body,
      ownerWalletAddress,
    });

    if (outcome.status === "blocked") {
      logSecurityEvent({
        kind: "PAYMENT_INTENT_REJECTED",
        keyHash: hashKey(guard.identityKey),
        detail: `reason=${outcome.kind}`,
      });
      const response = NextResponse.json(
        {
          ok: false,
          error: {
            code: "POLICY_BLOCKED",
            message: outcome.reason,
            kind: outcome.kind,
            violations: outcome.violations,
          },
          spending: outcome.spending,
        },
        { status: 422 },
      );
      applySecurityHeaders(response);
      return response;
    }

    const response = NextResponse.json({ ok: true, intent: outcome.intent, spending: outcome.spending });
    applySecurityHeaders(response);
    return response;
  } catch (error) {
    if (error instanceof TrustedLedgerUnavailableError) {
      const response = NextResponse.json(
        {
          ok: false,
          error: {
            code: "LEDGER_UNAVAILABLE",
            message: "Unable to verify the current spending limit. The request was blocked.",
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
        error: { code: "INTERNAL_ERROR", message: "The payment intent could not be created." },
      },
      { status: 500 },
    );
    applySecurityHeaders(response);
    return response;
  }
}
