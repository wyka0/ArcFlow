import { NextResponse } from "next/server";

import {
  getSessionFromRequest,
  sanitiseSession,
} from "@/lib/auth";
import { applySecurityHeaders, guardReadRequest } from "@/lib/security";

/**
 * GET /api/auth/session
 *
 * Returns a sanitised view of the current session, or `{ authenticated:
 * false }` when the caller has no valid session cookie. The session id and
 * the cookie value are NEVER included in the response body.
 *
 * Security (Sprint 10):
 *  - Rate limited under ANON_PROBE (20 / minute / identity) to prevent
 *    session oracle probing.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const guard = await guardReadRequest(request, {
    policy: "ANON_PROBE",
    enforceOrigin: false,
  });
  if (!guard.ok) return guard.response;

  const session = await getSessionFromRequest(request);
  const response = session
    ? NextResponse.json({ authenticated: true, session: sanitiseSession(session) })
    : NextResponse.json({ authenticated: false });
  applySecurityHeaders(response);
  return response;
}
