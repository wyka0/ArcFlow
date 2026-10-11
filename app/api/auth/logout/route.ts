import { NextResponse } from "next/server";

import {
  isProduction,
  revokeSessionFromRequest,
  serializeClearSessionCookie,
} from "@/lib/auth";
import { applySecurityHeaders, guardJsonRequest } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/logger";
import { hashKey } from "@/lib/security/rate-limit";

/**
 * POST /api/auth/logout
 *
 * Revokes the server-side session identified by the request cookie and
 * instructs the browser to discard the cookie. Logout is a server-side
 * operation: a client that simply deletes a local value is still
 * authenticated.
 *
 * Security (Sprint 10):
 *  - Rate limited under ANON_PROBE (20 / minute / identity).
 *  - Same-origin enforced.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardJsonRequest<Record<string, unknown>>(request, {
    policy: "ANON_PROBE",
    maxBytes: 1024,
    enforceOrigin: true,
    allowEmptyBody: true,
  });
  if (!guard.ok) return guard.response;

  await revokeSessionFromRequest(request);
  logSecurityEvent({ kind: "AUTH_LOGOUT", keyHash: hashKey(guard.identityKey) });
  const response = NextResponse.json({ ok: true, authenticated: false });
  response.headers.append("Set-Cookie", serializeClearSessionCookie(isProduction()));
  applySecurityHeaders(response);
  return response;
}
