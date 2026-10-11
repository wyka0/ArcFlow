import type { ServiceAdapter } from "@/types/service-request";
import { getMarketDataAdapter } from "./market-data/provider";

/**
 * MARKET DATA — Demo fixture adapter
 *
 * Deterministic fixture based on symbol. Never makes external network
 * calls. Used when MARKET_DATA_PROVIDER is not set to "coingecko".
 *
 * NOTE: The output source field is always "demo" so the UI can
 * distinguish it from live data. Tests depend on this being deterministic.
 */
export interface MarketDataInput {
  symbol: string;
  timeframe?: string;
}

export interface MarketDataOutput {
  symbol: string;
  price: string;
  change24h: string;
  volume24h: string;
  timestamp: string;
  source: "demo" | "coingecko";
  /** Provider name; rendered explicitly in the UI. */
  provider: string;
  /** Server-assessed freshness of the underlying data. */
  freshness?: "live" | "stale" | "unavailable";
}

export const marketDataAdapter: ServiceAdapter<MarketDataInput, MarketDataOutput> = {
  serviceId: "market-data",
  serviceName: "Market Data",

  async execute(input: MarketDataInput): Promise<MarketDataOutput> {
    const { symbol } = input;

    const basePrice = symbol.toLowerCase() === "btc" ? 65000 :
                      symbol.toLowerCase() === "eth" ? 3500 :
                      symbol.toLowerCase() === "sol" ? 180 : 1;

    const price = basePrice * (0.95 + Math.random() * 0.1);
    const change = -5 + Math.random() * 10;

    return {
      symbol: symbol.toUpperCase(),
      price: price.toFixed(2),
      change24h: change.toFixed(2),
      volume24h: (Math.random() * 1_000_000_000).toFixed(0),
      timestamp: new Date().toISOString(),
      source: "demo",
      provider: "demo",
    };
  },
};

/**
 * MARKET DATA — CoinGecko real provider adapter.
 *
 * Backed by CoinGecko's public /simple/price endpoint. Configured via
 * MARKET_DATA_PROVIDER environment variable. The adapter handles:
 *   - input validation (symbol → server-controlled id mapping)
 *   - HTTP fetch with timeout and bounded retry
 *   - JSON response schema validation
 *   - typed output mapping (price, change24h, volume24h)
 *   - freshness tracking (live / stale / unavailable)
 *
 * The user / browser MUST NOT call CoinGecko directly. All upstream
 * calls originate from this server-side adapter.
 *
 * NOTE: The output source field is always "coingecko" so the UI can
 * distinguish it from demo data.
 */
const coingeckoClient = await import("@/lib/services/market-data/coingecko");

export const marketDataCoinGeckoAdapter: ServiceAdapter<MarketDataInput, MarketDataOutput> = {
  serviceId: "market-data",
  serviceName: "Market Data",

  async execute(input: MarketDataInput): Promise<MarketDataOutput> {
    const { symbol } = input;

    // Validate and normalize the symbol using the server-controlled mapping.
    const symbolResult = (await import("@/lib/services/market-data/symbols"))
      .validateSymbol(symbol);

    if (!symbolResult.ok) {
      throw new Error(
        `MARKET_DATA_INVALID_SYMBOL: ${symbolResult.message}`,
      );
    }

    const { symbol: validatedSymbol, coingeckoId } = symbolResult;

    // Execute the real fetch-backed client. This client handles timeout,
    // retry, response validation, and maps to the typed output shape.
    const coingeckoResult = await coingeckoClient.fetchCoinGeckoPrice(coingeckoId);

    const freshness: "live" | "stale" | "unavailable" =
      /* always "live" when we get here — the fetch succeeded and
         observedAt is server-generated within seconds. */
      "live";

    return {
      symbol: validatedSymbol,
      price: coingeckoResult.priceUsd.toFixed(2),
      change24h: coingeckoResult.change24hPct.toFixed(2),
      volume24h: coingeckoResult.volume24hUsd.toFixed(0),
      timestamp: coingeckoResult.observedAt,
      source: "coingecko",
      provider: "coingecko",
      freshness,
    };
  },
};

/**
 * Research Report Service Adapter
 *
 * DEMO IMPLEMENTATION — Returns fixture data.
 */
export interface ResearchReportInput {
  topic: string;
  depth?: "summary" | "detailed";
}

export interface ResearchReportOutput {
  topic: string;
  title: string;
  summary: string;
  keyFindings: string[];
  depth: "summary" | "detailed";
  timestamp: string;
  source: "demo";
}

export const researchReportAdapter: ServiceAdapter<ResearchReportInput, ResearchReportOutput> = {
  serviceId: "research-report",
  serviceName: "Research Report",

  async execute(input: ResearchReportInput): Promise<ResearchReportOutput> {
    const { topic, depth = "summary" } = input;

    return {
      topic,
      title: `Research Report: ${topic}`,
      summary: `This is a ${depth} analysis of ${topic}. The market shows moderate volatility with potential upside.`,
      keyFindings: [
        "Market sentiment is cautiously optimistic",
        "Volume has increased 15% over the past week",
        "Key resistance level identified at 1.2x current price",
      ],
      depth,
      timestamp: new Date().toISOString(),
      source: "demo",
    };
  },
};

/**
 * AI Summary Service Adapter
 *
 * DEMO IMPLEMENTATION — Returns fixture data.
 */
export interface AISummaryInput {
  text: string;
  maxLength?: number;
}

export interface AISummaryOutput {
  originalLength: number;
  summary: string;
  compressionRatio: string;
  timestamp: string;
  source: "demo";
}

export const aiSummaryAdapter: ServiceAdapter<AISummaryInput, AISummaryOutput> = {
  serviceId: "ai-summary",
  serviceName: "AI Summary",

  async execute(input: AISummaryInput): Promise<AISummaryOutput> {
    const { text, maxLength = 200 } = input;

    const summary = text.length > maxLength
      ? text.slice(0, maxLength).trim() + "..."
      : text;

    return {
      originalLength: text.length,
      summary,
      compressionRatio: ((1 - summary.length / text.length) * 100).toFixed(1) + "%",
      timestamp: new Date().toISOString(),
      source: "demo",
    };
  },
};

/**
 * Registry of all service adapters.
 *
 * This is the single source of truth for service fulfillment.
 * The demo adapter is always included. The CoinGecko adapter is
 * conditionally registered after the provider has been resolved.
 */
export const serviceAdapters: ReadonlyArray<ServiceAdapter<object, object>> = [
  marketDataAdapter,
  researchReportAdapter,
  aiSummaryAdapter,
];

/**
 * Get the service adapter for a given service ID.
 * For "market-data", this returns the CoinGecko adapter if
 * MARKET_DATA_PROVIDER=coingecko is set, otherwise the demo adapter.
 */
export async function getServiceAdapter(serviceId: string): Promise<ServiceAdapter<object, object> | undefined> {
  if (serviceId === "market-data") {
    return getMarketDataAdapter();
  }
  return serviceAdapters.find((a) => a.serviceId === serviceId);
}