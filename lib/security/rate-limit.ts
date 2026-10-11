/**
 * Server-side token-bucket rate limiter.
 *
 * Designed for AgentPay's request abuse protection. The limiter is:
 *  - In-memory by default. A single-process store. For multi-instance
 *    production deployments, an external limiter is required (see §10 of
 *    the Sprint 10 design doc) — the API supports a custom store.
 *  - Deterministic for tests: the limiter takes an explicit `now()` and
 *    bucket store so unit tests do not need to mock time.
 *  - Fail-safe: the limiter NEVER crashes the request. If the underlying
 *    store throws, the request is allowed and a structured security log
 *    entry is emitted.
 *  - Identity-aware: callers provide the rate-limit key (session wallet
 *    for authenticated routes, IP for unauthenticated ones). The server
 *    never trusts the client's self-asserted identity.
 *
 * Architecture decisions are documented in
 * `docs/review/Sprint-10-Production-Security.md`.
 */

import { logSecurityEvent } from "./logger";

/** Maximum size of the in-memory key table before we sweep stale entries. */
const MAX_KEYS = 10_000;

/** Token bucket configuration for a single policy. */
export interface RateLimitPolicy {
  /** Stable identifier, e.g. "AUTH_CHALLENGE". */
  name: string;
  /** Maximum tokens (events) per window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  ok: boolean;
  /** Remaining tokens in the bucket after this request. */
  remaining: number;
  /** When the bucket will next allow a request, in ms since epoch. */
  retryAfterMs: number;
  /** The policy that produced this decision. */
  policy: RateLimitPolicy;
}

export interface RateLimitStore {
  /**
   * Consume one token for `key`. Returns the decision. Implementations
   * may throw — the caller must treat a throw as "fail open" with a
   * structured log entry.
   */
  consume(key: string, policy: RateLimitPolicy, now: number): RateLimitDecision;
  /** Test seam. */
  clearAll(): void;
}

interface Bucket {
  /** Tokens left in the current window. */
  tokens: number;
  /** When the window started (ms since epoch). */
  windowStartedAt: number;
}

/**
 * In-memory token-bucket store.
 *
 * Each key is a (policyName, identityKey) pair. Keys are pruned
 * opportunistically when the table exceeds MAX_KEYS.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  consume(key: string, policy: RateLimitPolicy, now: number): RateLimitDecision {
    const fullKey = `${policy.name}::${key}`;
    let bucket = this.buckets.get(fullKey);

    if (!bucket || now - bucket.windowStartedAt >= policy.windowMs) {
      bucket = { tokens: policy.max, windowStartedAt: now };
    }

    if (bucket.tokens <= 0) {
      const retryAfterMs = Math.max(0, policy.windowMs - (now - bucket.windowStartedAt));
      this.buckets.set(fullKey, bucket);
      this.prune(now);
      return { ok: false, remaining: 0, retryAfterMs, policy };
    }

    bucket.tokens -= 1;
    this.buckets.set(fullKey, bucket);
    this.prune(now);
    return { ok: true, remaining: bucket.tokens, retryAfterMs: 0, policy };
  }

  clearAll(): void {
    this.buckets.clear();
  }

  private prune(now: number): void {
    if (this.buckets.size < MAX_KEYS) return;
    const cutoff = now - 60 * 60 * 1000; // 1 hour
    for (const [key, bucket] of this.buckets) {
      if (bucket.windowStartedAt < cutoff) this.buckets.delete(key);
    }
  }
}

let activeStore: RateLimitStore = new InMemoryRateLimitStore();

/** Return the currently configured store. The default is in-memory. */
export function getRateLimitStore(): RateLimitStore {
  return activeStore;
}

/** Test seam. */
export function setRateLimitStoreForTesting(store: RateLimitStore | null): void {
  activeStore = store ?? new InMemoryRateLimitStore();
}

export interface ConsumeOptions {
  /** Caller-supplied key (e.g. wallet, IP, session id). Required. */
  key: string;
  policy: RateLimitPolicy;
  /** Override the clock for tests. Defaults to Date.now. */
  now?: () => number;
  /** Identifier of the request, for logging. Optional. */
  requestId?: string;
}

/**
 * Consume one token for `key` under `policy`. Fails open if the store
 * throws — but always emits a structured security event so the failure
 * is visible in operations.
 */
export function consumeRateLimit(options: ConsumeOptions): RateLimitDecision {
  const now = options.now?.() ?? Date.now();
  try {
    return activeStore.consume(options.key, options.policy, now);
  } catch (error) {
    logSecurityEvent({
      kind: "RATE_LIMITER_UNAVAILABLE",
      policy: options.policy.name,
      keyHash: hashKey(options.key),
      error: error instanceof Error ? error.message : String(error),
    });
    // Fail open: never block a real user because the limiter is broken.
    return { ok: true, remaining: options.policy.max, retryAfterMs: 0, policy: options.policy };
  }
}

/** Hash a key for safe logging — never log the raw wallet address or IP. */
export function hashKey(key: string): string {
  // Deterministic FNV-1a (32-bit). No crypto required; we only need a
  // stable opaque label for log correlation.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Named policies. Numbers are conservative defaults appropriate to the
// endpoint's normal traffic pattern. They are environment-overridable via
// the security configuration module.
// ---------------------------------------------------------------------------

export const POLICIES = {
  AUTH_CHALLENGE: { name: "AUTH_CHALLENGE", max: 10, windowMs: 60_000 },
  AUTH_VERIFY: { name: "AUTH_VERIFY", max: 10, windowMs: 60_000 },
  PAYMENT_INTENT: { name: "PAYMENT_INTENT", max: 30, windowMs: 60_000 },
  PAYMENT_VERIFY: { name: "PAYMENT_VERIFY", max: 30, windowMs: 60_000 },
  PAYMENT_HISTORY: { name: "PAYMENT_HISTORY", max: 60, windowMs: 60_000 },
  SERVICE_REQUEST: { name: "SERVICE_REQUEST", max: 30, windowMs: 60_000 },
  SERVICE_FULFILL: { name: "SERVICE_FULFILL", max: 20, windowMs: 60_000 },
  SERVICE_RESULT: { name: "SERVICE_RESULT", max: 60, windowMs: 60_000 },
  MARKET_DATA: { name: "MARKET_DATA", max: 60, windowMs: 60_000 },
  ANON_PROBE: { name: "ANON_PROBE", max: 20, windowMs: 60_000 },
  AGENT_REGISTER: { name: "AGENT_REGISTER", max: 5, windowMs: 60_000 },
  AGENT_REQUEST: { name: "AGENT_REQUEST", max: 30, windowMs: 60_000 },
  AGENT_STATUS: { name: "AGENT_STATUS", max: 60, windowMs: 60_000 },
  AGENT_RESULT: { name: "AGENT_RESULT", max: 60, windowMs: 60_000 },
  AGENT_PENDING: { name: "AGENT_PENDING", max: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

export type PolicyName = keyof typeof POLICIES;

export function getPolicy(name: PolicyName): RateLimitPolicy {
  return POLICIES[name];
}
