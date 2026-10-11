/**
 * Origin and same-site request validation.
 *
 * Strategy:
 *  - For state-changing endpoints that are authenticated via a cookie,
 *    require an Origin (or Referer fallback) that matches the
 *    configured canonical origin. Cross-origin state changes are
 *    rejected with 403.
 *  - For GETs that do not change state, origin is advisory only.
 *  - The canonical origin is derived from the `AUTH_CANONICAL_ORIGIN`
 *    environment variable when set; otherwise the request host is used
 *    in development. In production without `AUTH_CANONICAL_ORIGIN`, the
 *    request is rejected — we never guess the canonical origin in prod.
 */

import { getServerRuntime } from "./env";

/** Read the canonical origin from env, or compute a development fallback. */
export function getCanonicalOrigin(): string | null {
  const raw = process.env.AUTH_CANONICAL_ORIGIN;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim().replace(/\/+$/, "");
  }
  if (getServerRuntime() !== "production") {
    return null; // dev falls back to the request host
  }
  return null;
}

function originFromRequest(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      return null;
    }
  }
  const host = request.headers.get("host");
  if (host) {
    const scheme = getServerRuntime() === "production" ? "https" : "http";
    return `${scheme}://${host}`;
  }
  return null;
}

function sameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.protocol === ub.protocol && ua.host === ub.host;
  } catch {
    return false;
  }
}

export type OriginDecision =
  | { ok: true; origin: string }
  | { ok: false; code: "MISSING_ORIGIN" | "ORIGIN_MISMATCH"; message: string };

/**
 * Validate the request's Origin/Referer against the canonical origin.
 *
 * Use for state-changing cookie-authenticated requests. GETs may pass
 * `enforce: false` if they only need advisory validation.
 */
export function validateRequestOrigin(
  request: Request,
  options: { enforce: boolean } = { enforce: true },
): OriginDecision {
  const requestOrigin = originFromRequest(request);
  if (!requestOrigin) {
    if (!options.enforce) return { ok: true, origin: "" };
    return {
      ok: false,
      code: "MISSING_ORIGIN",
      message: "Request must include an Origin or Referer header.",
    };
  }

  const canonical = getCanonicalOrigin();
  if (!canonical) {
    // No canonical configured. In production this is an error; in
    // dev we accept the request origin itself as canonical.
    if (getServerRuntime() === "production") {
      return {
        ok: false,
        code: "MISSING_ORIGIN",
        message: "AUTH_CANONICAL_ORIGIN is required in production.",
      };
    }
    return { ok: true, origin: requestOrigin };
  }

  if (!sameOrigin(requestOrigin, canonical)) {
    return {
      ok: false,
      code: "ORIGIN_MISMATCH",
      message: "Cross-origin request rejected.",
    };
  }

  return { ok: true, origin: requestOrigin };
}
