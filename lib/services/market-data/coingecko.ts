import {
  invalidResponseError,
  rateLimitedError,
  upstreamTimeoutError,
  upstreamUnavailableError,
  type MarketDataError,
} from "@/lib/services/market-data/errors";

/**
 * CoinGecko HTTP client.
 *
 * Server-only. The browser MUST NOT call this — the upstream URL
 * contains no secrets but the request still originates from the
 * AgentPay server to:
 *   1. keep the user agent deterministic
 *   2. centralize timeout / retry / error mapping
 *   3. avoid exposing upstream URL shapes to the client
 *
 * CoinGecko's public /simple/price endpoint does not require an
 * API key, so this client does not read any secrets.
 *
 * The free public endpoint is rate-limited to roughly 10–30 calls
 * per minute per IP. We bound retries to keep us well within that
 * budget and to fail closed if the upstream is degraded.
 */

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 2;

export interface CoinGeckoPriceResult {
  /** Price in USD. */
  priceUsd: number;
  /** 24h change as a percentage (e.g. -1.23 means -1.23%). */
  change24hPct: number;
  /** 24h volume in USD. */
  volume24hUsd: number;
  /** Server-generated timestamp when the data was observed by AgentPay. */
  observedAt: string;
}

export interface CoinGeckoClientOptions {
  /** Override the upstream base URL (test-only). */
  baseUrl?: string;
  /** Override the per-request timeout. */
  timeoutMs?: number;
  /** Override the max number of attempts (initial + retries). */
  maxAttempts?: number;
  /** Inject a custom fetch (test-only). */
  fetchImpl?: typeof fetch;
}

interface CoinGeckoSimplePriceResponse {
  [coingeckoId: string]:
    | {
        usd?: number;
        usd_24h_change?: number;
        usd_24h_vol?: number;
        last_updated_at?: number;
      }
    | undefined;
}

/**
 * Build the CoinGecko /simple/price URL for a coin id.
 *
 * The id comes from a server-controlled allow-list (symbols.ts), never
 * from raw user input. We additionally re-validate the id before
 * constructing the URL as a defense-in-depth measure.
 */
export function buildSimplePriceUrl(coingeckoId: string, baseUrl?: string): string {
  const base = baseUrl ?? "https://api.coingecko.com/api/v3";
  const url = new URL("/simple/price", base);
  url.searchParams.set("ids", coingeckoId);
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");
  url.searchParams.set("include_24hr_vol", "true");
  url.searchParams.set("include_last_updated_at", "true");
  return url.toString();
}

/**
 * Fetch a single coin's USD price, 24h change, and 24h volume.
 *
 * The response is validated against an explicit shape before being
 * returned. Incomplete or malformed responses are rejected with
 * MARKET_DATA_INVALID_RESPONSE.
 */
export async function fetchCoinGeckoPrice(
  coingeckoId: string,
  options: CoinGeckoClientOptions = {},
): Promise<CoinGeckoPriceResult> {
  // Defense-in-depth: re-validate id shape before using it in a URL.
  if (!/^[a-z0-9-]{1,64}$/.test(coingeckoId)) {
    throw invalidResponseError();
  }

  const url = buildSimplePriceUrl(coingeckoId, options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  let lastError: MarketDataError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 429) {
        // Don't retry on rate-limit; the response is final.
        throw rateLimitedError();
      }

      if (response.status >= 500 || response.status === 408) {
        // Server-side / timeout. Retry on a fresh attempt.
        lastError = upstreamUnavailableError();
        if (attempt < maxAttempts) continue;
        throw lastError;
      }

      if (!response.ok) {
        // 4xx other than 429 — treat as a bad request against our URL,
        // do not retry, surface as invalid response.
        throw invalidResponseError();
      }

      // Parse and validate JSON body with a size cap.
      const text = await response.text();
      if (text.length > 64 * 1024) {
        throw invalidResponseError();
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw invalidResponseError();
      }

      return parsePriceResponse(coingeckoId, parsed);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = upstreamTimeoutError();
        if (attempt < maxAttempts) continue;
        throw lastError;
      }
      // Re-throw typed errors immediately (no retry).
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "string" &&
        (error as { code: string }).code.startsWith("MARKET_DATA_")
      ) {
        throw error;
      }
      // Unknown error: surface as upstream unavailable, but do retry once.
      lastError = upstreamUnavailableError();
      if (attempt < maxAttempts) continue;
      throw lastError;
    }
  }

  // Should be unreachable, but fail closed.
  throw lastError ?? upstreamUnavailableError();
}

/**
 * Validate the parsed JSON against the expected CoinGecko shape and
 * map to the typed result. Rejects incomplete responses.
 */
function parsePriceResponse(coingeckoId: string, raw: unknown): CoinGeckoPriceResult {
  if (typeof raw !== "object" || raw === null) {
    throw invalidResponseError();
  }
  const obj = raw as CoinGeckoSimplePriceResponse;
  const entry = obj[coingeckoId];
  if (!entry || typeof entry !== "object") {
    throw invalidResponseError();
  }

  const { usd, usd_24h_change, usd_24h_vol, last_updated_at } = entry;

  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
    throw invalidResponseError();
  }

  const change24hPct =
    typeof usd_24h_change === "number" && Number.isFinite(usd_24h_change)
      ? usd_24h_change
      : 0;

  const volume24hUsd =
    typeof usd_24h_vol === "number" && Number.isFinite(usd_24h_vol) && usd_24h_vol >= 0
      ? usd_24h_vol
      : 0;

  const observedAt = new Date().toISOString();

  // last_updated_at is informational; we always record observedAt
  // server-side so the freshness window is auditable.
  void last_updated_at;

  return {
    priceUsd: usd,
    change24hPct,
    volume24hUsd,
    observedAt,
  };
}
