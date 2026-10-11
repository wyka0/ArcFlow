/**
 * MARKET DATA — provider selector.
 *
 * Server-side. The provider is selected at module load time based on
 * the MARKET_DATA_PROVIDER env var. The browser never sees this value
 * — there is intentionally no NEXT_PUBLIC_ prefix.
 *
 *   MARKET_DATA_PROVIDER=demo       → deterministic fixture
 *   MARKET_DATA_PROVIDER=coingecko  → live public CoinGecko endpoint
 *
 * The default is "demo" so local development and CI are deterministic
 * and never accidentally hit the live network. To exercise the real
 * provider, set the env var in `.env.local` (already gitignored) and
 * restart the server.
 */

import type { MarketDataInput, MarketDataOutput } from "@/lib/services/market-data/adapter";
import type { ServiceAdapter } from "@/types/service-request";

let resolvedProvider: "demo" | "coingecko" | null = null;

function readProviderFromEnv(): "demo" | "coingecko" {
  const raw = process.env.MARKET_DATA_PROVIDER;
  if (typeof raw !== "string" || raw.length === 0) return "demo";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "coingecko") return "coingecko";
  return "demo";
}

export function getConfiguredMarketDataProvider(): "demo" | "coingecko" {
  if (resolvedProvider) return resolvedProvider;
  resolvedProvider = readProviderFromEnv();
  return resolvedProvider;
}

/** Test-only override. */
export function setMarketDataProviderForTesting(id: "demo" | "coingecko" | null): void {
  resolvedProvider = id;
}

/**
 * Return the live adapter for the market-data service.
 *
 * In "demo" mode this returns the deterministic fixture adapter
 * (marketDataAdapter from adapters.ts). In "coingecko" mode this
 * returns the real HTTP-backed adapter (marketDataCoinGeckoAdapter).
 *
 * Both satisfy the same ServiceAdapter contract; the UI does not
 * need to know which provider is in use beyond the source /
 * freshness / provider fields on the output.
 */
export async function getMarketDataAdapter(): Promise<ServiceAdapter<MarketDataInput, MarketDataOutput>> {
  const id = getConfiguredMarketDataProvider();
  if (id === "coingecko") {
    return (await import("@/lib/services/market-data/adapter"))
      .marketDataCoinGeckoAdapter;
  }
  return Promise.resolve((await import("@/lib/services/market-data/adapter")).marketDataAdapter);
}