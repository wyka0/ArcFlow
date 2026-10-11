import type { NextConfig } from "next";

import { buildSecurityHeaders } from "@/lib/security/headers";

/**
 * Sprint 10: apply security headers to every response at the Next.js
 * layer. Route handlers may extend or override specific headers, but
 * the baseline set is enforced here so no route can accidentally ship
 * without them.
 *
 * CSP strategy:
 *  - In production, the strict policy from `lib/security/headers` is
 *    used. No `unsafe-eval`, no `unsafe-inline` for script-src.
 *  - In development, the permissive policy is used so Next.js dev
 *    tools, HMR, and Framer Motion keep working.
 *
 * The exact policy lives in `lib/security/headers.ts`; this file
 * only wires it.
 */
const securityHeaders = buildSecurityHeaders();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(securityHeaders).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ];
  },
};

export default nextConfig;
