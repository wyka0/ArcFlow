import { NextResponse } from "next/server";

import { applySecurityHeaders } from "@/lib/security";
import { getConfiguredMarketDataProvider } from "@/lib/services/market-data/provider";

/**
 * GET /api/diagnostics/market-data-provider
 *
 * Read-only diagnostic endpoint to verify the configured market data provider.
 *
 * Security:
 * - No authentication required (read-only, no secrets exposed)
 * - No authentication secrets returned
 * - No API keys returned
 * - No wallet interaction
 * - No payment interaction
 * - No database mutation
 * - No blockchain interaction
 * - No secrets exposed
 *
 * Response:
 * {
 *   "provider": "coingecko" | "demo",
 *   "adapter": "marketDataCoinGeckoAdapter" | "marketDataAdapter",
 *   "live": boolean
 * }
 */

const MAX_BODY_BYTES = 1024;

export async function GET(): Promise<NextResponse> {
  const provider = getConfiguredMarketDataProvider();
  const isLive = provider === "coingecko";

  let adapter: string;
  let live: boolean;

  if (provider === "coingecko") {
    adapter = "marketDataCoinGeckoAdapter";
    live = true;
  } else {
    adapter = "marketDataAdapter";
    live = false;
  }

  const response = NextResponse.json({
    provider,
    adapter,
    live,
  });

  applySecurityHeaders(response);
  return response;
}