/**
 * Market data service errors.
 *
 * Typed, server-side error model. The message field is safe to surface
 * to the browser — it never includes stack traces, raw upstream
 * response bodies, internal URLs, or implementation details.
 */

export type MarketDataErrorCode =
  | "MARKET_DATA_INVALID_SYMBOL"
  | "MARKET_DATA_INVALID_TIMEFRAME"
  | "MARKET_DATA_UPSTREAM_UNAVAILABLE"
  | "MARKET_DATA_UPSTREAM_TIMEOUT"
  | "MARKET_DATA_INVALID_RESPONSE"
  | "MARKET_DATA_RATE_LIMITED"
  | "MARKET_DATA_UNAVAILABLE";

/**
 * Base class for market-data errors. The statusCode is used by the
 * API layer to translate errors into HTTP responses without exposing
 * any of the internal fields.
 */
export class MarketDataError extends Error {
  public readonly code: MarketDataErrorCode;
  public readonly statusCode: number;

  constructor(
    code: MarketDataErrorCode,
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "MarketDataError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function invalidSymbolError(message: string): MarketDataError {
  return new MarketDataError("MARKET_DATA_INVALID_SYMBOL", message, 400);
}

export function invalidTimeframeError(message: string): MarketDataError {
  return new MarketDataError("MARKET_DATA_INVALID_TIMEFRAME", message, 400);
}

export function upstreamUnavailableError(): MarketDataError {
  return new MarketDataError(
    "MARKET_DATA_UPSTREAM_UNAVAILABLE",
    "Market data provider is currently unavailable.",
    502,
  );
}

export function upstreamTimeoutError(): MarketDataError {
  return new MarketDataError(
    "MARKET_DATA_UPSTREAM_TIMEOUT",
    "Market data provider did not respond in time.",
    504,
  );
}

export function invalidResponseError(): MarketDataError {
  return new MarketDataError(
    "MARKET_DATA_INVALID_RESPONSE",
    "Market data provider returned an invalid response.",
    502,
  );
}

export function rateLimitedError(): MarketDataError {
  return new MarketDataError(
    "MARKET_DATA_RATE_LIMITED",
    "Market data provider rate limit exceeded.",
    429,
  );
}

export function unavailableError(): MarketDataError {
  return new MarketDataError(
    "MARKET_DATA_UNAVAILABLE",
    "Market data is currently unavailable.",
    503,
  );
}
