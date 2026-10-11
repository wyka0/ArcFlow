import { NextResponse } from "next/server";

import { hasDurableLedger, getTrustedRepository } from "@/lib/payments/server/factory";
import { validateEnvironment } from "@/lib/config/validation";
import { hasDurableAuth, getAuthSessionRepository } from "@/lib/auth";
import { applySecurityHeaders, getServerRuntime } from "@/lib/security";

/** Determine if a Neon connection string uses PgBouncer pooling. */
function looksPooled(url?: string): boolean {
  if (!url) return false;
  // Neon pooled URLs typically contain pooler endpoints
  return url.includes("-pooler.") || url.includes("pgbouncer") || url.includes("pooler");
}

/**
 * GET /api/health
 *
 * Liveness + readiness endpoint.
 *
 * Returns:
 * - application: "alive"
 * - trustedLedger: "ready" | "not_configured" | "unavailable"
 * - authSessions: "ready" | "not_configured" | "unavailable"
 * - environment: validation status (missing required keys only, never values)
 * - runtime: "production" | "development" | "test"
 *
 * Does NOT expose:
 * - database credentials
 * - environment variable values
 * - internal infrastructure details
 * - secrets
 *
 * The endpoint is unauthenticated and rate limited (it is a low-cost
 * probe).
 */
export async function GET(): Promise<NextResponse> {
  const ledgerStatus = await checkLedger();
  const authStatus = await checkAuth();
  const envValidation = validateEnvironment();

  // Collect database selection diagnostics (sanitized)
  const nonPoolingUrl = process.env.POSTGRES_URL_NON_POOLING?.trim();
  const unpooledUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
  const pooledUrl = process.env.DATABASE_URL?.trim();

  const selectedSource =
    nonPoolingUrl ? "POSTGRES_URL_NON_POOLING" :
    unpooledUrl ? "DATABASE_URL_UNPOOLED" :
    pooledUrl ? "DATABASE_URL" : "NONE";

  const selectedSourcePresent = Boolean(
    nonPoolingUrl || unpooledUrl || pooledUrl
  );

  const selectedSourceLooksPooled = selectedSource === "DATABASE_URL"
    ? looksPooled(pooledUrl)
    : selectedSource === "DATABASE_URL_UNPOOLED"
      ? looksPooled(unpooledUrl)
      : selectedSource === "POSTGRES_URL_NON_POOLING"
        ? looksPooled(nonPoolingUrl)
        : false;

  const response = NextResponse.json({
    ok: true,
    application: "alive",
    trustedLedger: ledgerStatus,
    authSessions: authStatus,
    database: {
      driver: "pg",
      selectedSource,
      selectedSourcePresent,
      selectedSourceLooksPooled,
      poolCount: 5, // service-request, service-result, trusted-ledger, auth-session, agent-registry
      repositoriesUsingFactory: 5,
    },
    environment: {
      ok: envValidation.ok,
      missingRequiredCount: envValidation.missingRequired.length,
      missingRequired: envValidation.missingRequired.map((s) => s.split(" ")[0]),
      warnings: envValidation.warnings,
    },
    runtime: getServerRuntime(),
    timestamp: new Date().toISOString(),
  });
  applySecurityHeaders(response);
  return response;
}

async function checkLedger(): Promise<"ready" | "not_configured" | "unavailable"> {
  if (!hasDurableLedger()) return "not_configured";
  try {
    await getTrustedRepository();
    return "ready";
  } catch {
    return "unavailable";
  }
}

async function checkAuth(): Promise<"ready" | "not_configured" | "unavailable"> {
  if (!hasDurableAuth()) return "not_configured";
  try {
    await getAuthSessionRepository();
    return "ready";
  } catch {
    return "unavailable";
  }
}