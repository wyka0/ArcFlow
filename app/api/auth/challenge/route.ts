import { NextResponse } from "next/server";

import {
  getChallengeStore,
  isEvmAddress,
} from "@/lib/auth";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";
import { readStringField } from "@/lib/security/request-body";
import { validateRequestOrigin, getCanonicalOrigin } from "@/lib/security/origin";

/**
 * POST /api/auth/challenge
 *
 * Body: `{ walletAddress: string }`
 *
 * Returns: `{ id, message, issuedAt, expiresAt }`
 *
 * The challenge is a short-lived, single-use nonce the wallet will sign. The
 * client must immediately present the signature to `/api/auth/verify` before
 * the challenge expires; expired or consumed challenges are rejected.
 *
 * The server NEVER produces a predictable challenge. The nonce is a
 * cryptographically random 32-byte value; the challenge id is a separate
 * random 16-byte value. Both are bound to the requested wallet and to the
 * server-validated origin.
 *
 * Security (Sprint 10):
 *  - Body size cap: 1 KB (wallet addresses are 42 chars).
 *  - Content-Type: application/json.
 *  - Origin must be same-site (validated by guard).
 *  - Rate limited under AUTH_CHALLENGE (10 / minute / identity).
 *  - The origin embedded in the message is the server-validated origin,
 *    not the client's literal header value, to prevent reflected header
 *    attacks.
 */
const MAX_BODY_BYTES = 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<Record<string, unknown>>(request, {
    policy: "AUTH_CHALLENGE",
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

  // The origin embedded in the signed message is the server-canonical
  // origin, not the raw header value. This prevents an attacker from
  // forging a different origin in the message body.
  const canonical = getCanonicalOrigin();
  let origin = canonical;
  if (!origin) {
    const decision = validateRequestOrigin(request, { enforce: false });
    origin = decision.ok ? decision.origin : "";
  }
  if (!origin) {
    return NextResponse.json(
      { ok: false, error: { code: "MISSING_ORIGIN", message: "Request must include an Origin or Referer header." } },
      { status: 400 },
    );
  }

  const store = getChallengeStore();
  const challenge = store.create({ walletAddress: walletField.value, origin });

  logSecurityEvent({
    kind: "AUTH_CHALLENGE_CREATED",
    keyHash: hashKey(guard.identityKey),
    detail: `wallet=${walletField.value.slice(0, 6)}…`,
  });

  const response = NextResponse.json({
    ok: true,
    challenge: {
      id: challenge.id,
      message: challenge.message,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
    },
  });
  applySecurityHeaders(response);
  return response;
}
