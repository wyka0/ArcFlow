/**
 * Sprint 10 — Rate limiter behaviour.
 *
 * Covers:
 *  - under-limit calls succeed
 *  - over-limit calls are rejected with a retryAfter
 *  - separate policies do not share buckets
 *  - different keys get independent buckets
 *  - window expiration refills the bucket
 *  - the store fails open if it throws
 *  - key hashing is stable and short
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  getPolicy,
  hashKey,
  InMemoryRateLimitStore,
  POLICIES,
  setRateLimitStoreForTesting,
  type RateLimitPolicy,
  type RateLimitStore,
} from "@/lib/security";

const FIXED_NOW = 1_700_000_000_000;

describe("rate limit — in-memory store", () => {
  let store: InMemoryRateLimitStore;
  beforeEach(() => {
    store = new InMemoryRateLimitStore();
    setRateLimitStoreForTesting(store);
  });

  it("allows requests under the limit", () => {
    const policy: RateLimitPolicy = { name: "TEST", max: 3, windowMs: 60_000 };
    expect(consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW }).ok).toBe(true);
    expect(consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW }).ok).toBe(true);
    expect(consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW }).ok).toBe(true);
  });

  it("rejects requests over the limit and reports retryAfter", () => {
    const policy: RateLimitPolicy = { name: "TEST", max: 2, windowMs: 60_000 };
    consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW });
    consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW });
    const third = consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW });
    expect(third.ok).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
    expect(third.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("refills the bucket after the window expires", () => {
    const policy: RateLimitPolicy = { name: "TEST", max: 1, windowMs: 60_000 };
    const first = consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW });
    expect(first.ok).toBe(true);
    const second = consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW + 30_000 });
    expect(second.ok).toBe(false);
    const third = consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW + 60_001 });
    expect(third.ok).toBe(true);
  });

  it("keeps different keys in separate buckets", () => {
    const policy: RateLimitPolicy = { name: "TEST", max: 1, windowMs: 60_000 };
    const a = consumeRateLimit({ key: "alpha", policy, now: () => FIXED_NOW });
    const b = consumeRateLimit({ key: "beta", policy, now: () => FIXED_NOW });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("keeps different policies in separate buckets", () => {
    const a: RateLimitPolicy = { name: "A", max: 1, windowMs: 60_000 };
    const b: RateLimitPolicy = { name: "B", max: 1, windowMs: 60_000 };
    const r1 = consumeRateLimit({ key: "k", policy: a, now: () => FIXED_NOW });
    const r2 = consumeRateLimit({ key: "k", policy: b, now: () => FIXED_NOW });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it("fails open if the underlying store throws", () => {
    const throwing: RateLimitStore = {
      consume: () => {
        throw new Error("backend down");
      },
      clearAll: () => {},
    };
    setRateLimitStoreForTesting(throwing);
    const policy: RateLimitPolicy = { name: "TEST", max: 1, windowMs: 60_000 };
    const decision = consumeRateLimit({ key: "k", policy, now: () => FIXED_NOW });
    expect(decision.ok).toBe(true);
    setRateLimitStoreForTesting(store);
  });

  it("exposes the standard policy set", () => {
    expect(POLICIES.AUTH_CHALLENGE.max).toBe(10);
    expect(POLICIES.PAYMENT_INTENT.max).toBe(30);
    expect(POLICIES.MARKET_DATA.max).toBe(60);
  });

  it("hashKey produces a stable 8-character hex label", () => {
    const h1 = hashKey("0xabc");
    const h2 = hashKey("0xabc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
    const h3 = hashKey("0xdef");
    expect(h3).not.toBe(h1);
  });

  it("getPolicy returns the canonical policy by name", () => {
    expect(getPolicy("AUTH_CHALLENGE").max).toBe(POLICIES.AUTH_CHALLENGE.max);
    expect(getPolicy("PAYMENT_INTENT").windowMs).toBe(POLICIES.PAYMENT_INTENT.windowMs);
  });
});
