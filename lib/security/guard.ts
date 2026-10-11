/**
 * Guard helper for route handlers.
 *
 * Bundles:
 *  - body read with size cap
 *  - origin validation (for cookie-authenticated state-changing requests)
 *  - rate limit with the named policy
 *  - structured security logging
 *
 * Returns either a successful `body` or a ready-made `NextResponse`
 * that the route handler can return as-is. The route handler never
 * has to write a 401/403/413/415/429 itself.
 */

import { NextResponse } from "next/server";

import {
  consumeRateLimit,
  hashKey,
  readJsonBody,
  resolveSecurityIdentity,
  validateRequestOrigin,
  type PolicyName,
  type ReadJsonBodyResult,
} from ".";
import { logSecurityEvent } from "./logger";
import { applySecurityHeaders } from "./headers";

export interface GuardOptions {
  /** Maximum body size in bytes. Required for state-changing routes. */
  maxBytes?: number;
  /** Whether to enforce origin validation. Default: true for state-changing requests. */
  enforceOrigin?: boolean;
  /** Rate limit policy. Required. */
  policy: PolicyName;
  /** Whether to allow GETs without bodies. */
  method?: "GET" | "POST";
  /** Allow the request to omit a JSON body. Default: false. */
  allowEmptyBody?: boolean;
}

export type GuardResult<T> =
  | { ok: true; body: T; identityKey: string }
  | { ok: false; response: NextResponse };

function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  const response = NextResponse.json(
    { ok: false, error: { code, message } },
    { status },
  );
  applySecurityHeaders(response);
  return response;
}

/**
 * Run the standard guard pipeline for a route handler.
 *
 * Returns the parsed body on success, or a ready-made NextResponse
 * containing the right status code and error code on failure.
 */
export async function guardJsonRequest<T = unknown>(
  request: Request,
  options: GuardOptions,
): Promise<GuardResult<T>> {
  // 1. Identity (used for rate limiting and logging).
  const identity = await resolveSecurityIdentity(request);
  const identityKey = identity.key;

  // 2. Origin (state-changing requests with a cookie must be same-origin).
  if (options.enforceOrigin !== false) {
    const origin = validateRequestOrigin(request, { enforce: true });
    if (!origin.ok) {
      logSecurityEvent({
        kind: "ORIGIN_REJECTED",
        keyHash: hashKey(identityKey),
        detail: origin.code,
      });
      return {
        ok: false,
        response: errorResponse(403, origin.code, origin.message),
      };
    }
  }

  // 3. Rate limit.
  const decision = consumeRateLimit({
    key: identityKey,
    policy: (await import("./rate-limit")).getPolicy(options.policy),
    requestId: request.headers.get("x-request-id") ?? undefined,
  });
  if (!decision.ok) {
    logSecurityEvent({
      kind: "RATE_LIMITED",
      keyHash: hashKey(identityKey),
      policy: decision.policy.name,
    });
    const response = errorResponse(
      429,
      "RATE_LIMITED",
      "Too many requests. Slow down and try again shortly.",
    );
    response.headers.set("Retry-After", Math.ceil(decision.retryAfterMs / 1000).toString());
    return { ok: false, response };
  }

  // 4. Body. For GETs, the caller may skip this by passing method: "GET".
  if (options.method === "GET") {
    return { ok: true, body: undefined as T, identityKey };
  }

  // Endpoints that opt out of a body (e.g. logout) skip the body parse.
  if (options.allowEmptyBody) {
    return { ok: true, body: {} as T, identityKey };
  }

  const bodyResult: ReadJsonBodyResult = await readJsonBody(request, {
    maxBytes: options.maxBytes,
    identityKey,
  });
  if (!bodyResult.ok) {
    return { ok: false, response: errorResponse(bodyResult.status, bodyResult.code, bodyResult.message) };
  }

  return { ok: true, body: bodyResult.body as T, identityKey };
}

/**
 * Run the guard for a read-only endpoint. The body is not read; the
 * origin and rate limit are still applied.
 */
export async function guardReadRequest(
  request: Request,
  options: { policy: PolicyName; enforceOrigin?: boolean },
): Promise<GuardResult<undefined>> {
  return guardJsonRequest<undefined>(request, {
    policy: options.policy,
    enforceOrigin: options.enforceOrigin,
    method: "GET",
  });
}
