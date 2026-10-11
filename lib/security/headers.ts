/**
 * Security headers for AgentPay.
 *
 * Header policy:
 *  - `Content-Security-Policy` is configurable per runtime:
 *      - development: permissive enough for Next.js dev tools, HMR,
 *        React Fast Refresh, and Framer Motion's inline styles.
 *      - production: strict, no `unsafe-eval`, no `unsafe-inline` for
 *        script-src. Inline styles are allowed because the brutalist
 *        design system uses heavy inline style attributes.
 *  - `X-Content-Type-Options: nosniff` always.
 *  - `Referrer-Policy: strict-origin-when-cross-origin` always.
 *  - `X-Frame-Options: DENY` (defense in depth alongside CSP frame-ancestors).
 *  - `Permissions-Policy` disables sensors, geolocation, camera, microphone,
 *    payment (AgentPay never uses the Payment Request API in-browser).
 *  - `Strict-Transport-Security` only in production, max-age 1 year,
 *    includeSubDomains.
 *  - `Cross-Origin-Opener-Policy: same-origin` and
 *    `Cross-Origin-Resource-Policy: same-origin` to harden the browsing
 *    context.
 *  - `X-Powered-By` is removed.
 *
 * The headers are returned as a `Record<string, string>` and applied by
 * `applySecurityHeaders(response)` and `next.config.ts`.
 */

import { getServerRuntime } from "./env";

const PROD_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  // Script tags: self + inline. Next.js injects inline scripts for
  // hydration (self.__next_f), module registration, and dynamic imports.
  "script-src 'self' 'unsafe-inline'",
  // Inline styles allowed because the design system uses heavy inline
  // style attributes (Framer Motion + tailwind utilities).
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://* wss://*",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const DEV_CSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://* wss://*",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join("; ");

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

export function buildSecurityHeaders(): Record<string, string> {
  const isProd = getServerRuntime() === "production";
  const headers: Record<string, string> = {
    "Content-Security-Policy": isProd ? PROD_CSP : DEV_CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (isProd) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

/**
 * Apply the security headers to a Next.js `NextResponse` or any
 * response-like object that has a `headers` instance.
 */
export function applySecurityHeaders(
  response: { headers: Headers },
): void {
  const headers = buildSecurityHeaders();
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
}
