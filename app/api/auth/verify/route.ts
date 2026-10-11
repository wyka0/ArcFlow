import { NextResponse } from "next/server";
import { getAddress } from "viem";

import {
  AUTH_MESSAGE_DISCLAIMER,
  AUTH_MESSAGE_HEADER,
  createSessionForWallet,
  getChallengeStore,
  isEvmAddress,
  isProduction,
  sanitiseSession,
  serializeSessionCookie,
  verifyAuthSignature,
} from "@/lib/auth";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";
import { readStringField } from "@/lib/security/request-body";

/**
 * POST /api/auth/verify
 *
 * Body: `{ walletAddress, challengeId, signature }`
 *
 * Verifies the wallet signed the exact challenge message issued by
 * `/api/auth/challenge`, creates a server-side session, and sets an
 * HttpOnly cookie. The response body is a sanitised session view; the
 * session id is never returned to the browser.
 *
 * Returns 401 on any verification failure, with a generic error message
 * so the endpoint cannot be used as an oracle.
 *
 * Security (Sprint 10):
 *  - Body size cap: 4 KB (wallet + challengeId + signature).
 *  - Content-Type: application/json.
 *  - Origin must be same-site.
 *  - Rate limited under AUTH_VERIFY (10 / minute / identity).
 *  - Failed verifications are logged with a hashed identity only.
 */
const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<Record<string, unknown>>(request, {
    policy: "AUTH_VERIFY",
    maxBytes: MAX_BODY_BYTES,
  });
  if (!guard.ok) return guard.response;

  const walletField = readStringField(guard.body, "walletAddress", 80);
  if (!walletField.ok) {
    return NextResponse.json(
      { ok: false, error: { code: walletField.code, message: walletField.message } },
      { status: walletField.status },
    );
  }
  if (!isEvmAddress(walletField.value)) {
    return NextResponse.json(
      { ok: false, error: { code: "MALFORMED_WALLET", message: "walletAddress must be a valid EVM address." } },
      { status: 400 },
    );
  }
  const challengeField = readStringField(guard.body, "challengeId", 128);
  if (!challengeField.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "MISSING_CHALLENGE", message: challengeField.message } },
      { status: challengeField.status },
    );
  }
  const signatureField = readStringField(guard.body, "signature", 1024);
  if (!signatureField.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "MISSING_SIGNATURE", message: signatureField.message } },
      { status: signatureField.status },
    );
  }

  const store = getChallengeStore();
  // consume() is atomic: it removes the challenge and verifies the binding
  // in one call. A challenge is single-use, regardless of outcome.
  const challenge = store.consume(challengeField.value, walletField.value);
  if (!challenge) {
    logSecurityEvent({
      kind: "AUTH_VERIFY_FAILURE",
      keyHash: hashKey(guard.identityKey),
      detail: "challenge-invalid",
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_CHALLENGE",
          message: "Challenge is invalid, expired, or has already been used.",
        },
      },
      { status: 401 },
    );
  }

  const verification = await verifyAuthSignature({
    message: challenge.message,
    signature: signatureField.value,
    expectedWallet: walletField.value,
  });

  if (!verification.ok) {
    logSecurityEvent({
      kind: "AUTH_VERIFY_FAILURE",
      keyHash: hashKey(guard.identityKey),
      detail: "signature-invalid",
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SIGNATURE_INVALID",
          message: "The signature did not match the requested wallet or the challenge message.",
        },
      },
      { status: 401 },
    );
  }

  const { session } = await createSessionForWallet(verification.signer);

  logSecurityEvent({
    kind: "AUTH_VERIFY_SUCCESS",
    keyHash: hashKey(guard.identityKey),
  });
  logSecurityEvent({
    kind: "AUTH_SESSION_CREATED",
    keyHash: hashKey(guard.identityKey),
  });

  const response = NextResponse.json({
    ok: true,
    session: sanitiseSession(session),
    notice: {
      header: AUTH_MESSAGE_HEADER,
      disclaimer: AUTH_MESSAGE_DISCLAIMER,
    },
  });

  // Set the HttpOnly session cookie.
  response.headers.append("Set-Cookie", serializeSessionCookie(session.id, isProduction()));
  applySecurityHeaders(response);
  return response;
}

// Re-export the canonical address helper so unit tests can normalise
// addresses the same way the verify path does.
export { getAddress };
