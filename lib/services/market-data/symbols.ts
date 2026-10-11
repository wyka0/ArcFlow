/**
 * Market data — symbol mapping.
 *
 * Server-controlled mapping from user-supplied ticker symbols to
 * CoinGecko coin IDs. The browser never builds URLs from raw input;
 * the server resolves a symbol to a fixed, server-side identifier.
 *
 * The list is intentionally small and explicit so that:
 *   - new symbols are reviewed and added intentionally
 *   - typos and unknown symbols fail closed (MARKET_DATA_INVALID_SYMBOL)
 *   - the upstream URL is always constructed from a server-controlled
 *     id, never from raw user input
 */

export const SUPPORTED_SYMBOLS: ReadonlyArray<string> = [
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "ADA",
  "DOGE",
  "AVAX",
  "MATIC",
  "LINK",
];

const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  LINK: "chainlink",
};

const MAX_SYMBOL_LENGTH = 16;
const SYMBOL_PATTERN = /^[A-Z0-9]{1,16}$/;

export type SymbolValidation =
  | { ok: true; symbol: string; coingeckoId: string }
  | { ok: false; code: "MARKET_DATA_INVALID_SYMBOL"; message: string };

/**
 * Validate and normalize a user-supplied symbol.
 *
 * - Rejects empty strings
 * - Rejects overly long strings (bounded)
 * - Rejects characters outside the expected ticker alphabet
 * - Uppercases for case-insensitive matching
 * - Rejects symbols that are not in the server-controlled allow-list
 */
export function validateSymbol(raw: unknown): SymbolValidation {
  if (typeof raw !== "string") {
    return { ok: false, code: "MARKET_DATA_INVALID_SYMBOL", message: "symbol must be a string." };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: "MARKET_DATA_INVALID_SYMBOL", message: "symbol is required." };
  }

  if (trimmed.length > MAX_SYMBOL_LENGTH) {
    return {
      ok: false,
      code: "MARKET_DATA_INVALID_SYMBOL",
      message: `symbol must be at most ${MAX_SYMBOL_LENGTH} characters.`,
    };
  }

  const upper = trimmed.toUpperCase();

  if (!SYMBOL_PATTERN.test(upper)) {
    return {
      ok: false,
      code: "MARKET_DATA_INVALID_SYMBOL",
      message: "symbol must contain only A–Z and 0–9.",
    };
  }

  const coingeckoId = SYMBOL_TO_COINGECKO_ID[upper];
  if (!coingeckoId) {
    return {
      ok: false,
      code: "MARKET_DATA_INVALID_SYMBOL",
      message: `symbol "${upper}" is not supported.`,
    };
  }

  return { ok: true, symbol: upper, coingeckoId };
}

export const SUPPORTED_TIMEFRAMES: ReadonlyArray<string> = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];

export type TimeframeValidation =
  | { ok: true; timeframe: string }
  | { ok: false; code: "MARKET_DATA_INVALID_TIMEFRAME"; message: string };

/**
 * Validate a user-supplied timeframe. Timeframe is metadata for the
 * eventual UI display only — CoinGecko's free /simple/price endpoint
 * does not actually return per-timeframe data, so the validated value
 * is preserved on the output for the UI but does not affect the
 * upstream request.
 */
export function validateTimeframe(raw: unknown): TimeframeValidation {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, timeframe: "1d" };
  }

  if (typeof raw !== "string") {
    return {
      ok: false,
      code: "MARKET_DATA_INVALID_TIMEFRAME",
      message: "timeframe must be a string.",
    };
  }

  const normalized = raw.toLowerCase();
  if (!SUPPORTED_TIMEFRAMES.includes(normalized)) {
    return {
      ok: false,
      code: "MARKET_DATA_INVALID_TIMEFRAME",
      message: `timeframe must be one of: ${SUPPORTED_TIMEFRAMES.join(", ")}.`,
    };
  }

  return { ok: true, timeframe: normalized };
}
