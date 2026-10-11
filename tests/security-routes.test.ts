/**
 * Sprint 10 — Route-level security integration.
 *
 * Asserts that:
 *  - the rate limit triggers a 429 response on a protected route
 *  - an oversized body returns 413
 *  - a missing content-type returns 415
 *  - an unauthenticated `/api/payments/history` returns 401 even
 *    when the body is valid
 *  - the security headers are present on every protected response
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { type Address } from "viem";

import { POST as challengeHandler } from "@/app/api/auth/challenge/route";
import { POST as verifyHandler } from "@/app/api/auth/verify/route";
import { GET as historyHandler } from "@/app/api/payments/history/route";

import {
  createInMemoryAuthSessionRepository,
  createInMemoryChallengeStore,
  setAuthSessionRepositoryForTesting,
  setChallengeStoreForTesting,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { createInMemoryTrustedRepository, setTrustedRepositoryForTesting } from "@/lib/payments/server/factory";
import {
  InMemoryRateLimitStore,
  setRateLimitStoreForTesting,
  setSecurityLoggerSinkForTesting,
} from "@/lib/security";

const WALLET = "0xAbC1234567890aBcD1234567890abcD123456789" as Address;
const account = privateKeyToAccount(`0x${"c".repeat(64)}` as `0x${string}`);

function jsonPost(url: string, body: unknown, origin = "https://app.agentpay.example"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

function jsonGet(url: string, cookieValue?: string): Request {
  const headers: Record<string, string> = { origin: "https://app.agentpay.example" };
  if (cookieValue) headers["cookie"] = `${SESSION_COOKIE_NAME}=${cookieValue}`;
  return new Request(url, { method: "GET", headers });
}

async function signIn(): Promise<string> {
  const ch = await challengeHandler(jsonPost("https://app.agentpay.example/api/auth/challenge", { walletAddress: account.address }));
  const chBody = await ch.json();
  const sig = await account.signMessage({ message: chBody.challenge.message });
  const v = await verifyHandler(
    jsonPost("https://app.agentpay.example/api/auth/verify", {
      walletAddress: account.address,
      challengeId: chBody.challenge.id,
      signature: sig,
    }),
  );
  const setCookie = v.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0]?.split("=")[1] ?? "";
}

describe("security — route integration", () => {
  beforeEach(() => {
    setChallengeStoreForTesting(createInMemoryChallengeStore());
    setAuthSessionRepositoryForTesting(createInMemoryAuthSessionRepository());
    setTrustedRepositoryForTesting(createInMemoryTrustedRepository());
    setRateLimitStoreForTesting(new InMemoryRateLimitStore());
    setSecurityLoggerSinkForTesting(() => {});
  });
  afterEach(() => {
    setChallengeStoreForTesting(null);
    setAuthSessionRepositoryForTesting(null);
    setTrustedRepositoryForTesting(null);
    setRateLimitStoreForTesting(null);
    setSecurityLoggerSinkForTesting(null);
  });

  it("returns 415 for non-JSON content type", async () => {
    const response = await challengeHandler(
      new Request("https://app.agentpay.example/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "text/plain", origin: "https://app.agentpay.example" },
        body: "walletAddress=foo",
      }),
    );
    expect(response.status).toBe(415);
  });

  it("returns 413 for oversize body", async () => {
    const huge = JSON.stringify({ walletAddress: WALLET, extra: "x".repeat(8 * 1024) });
    const response = await challengeHandler(
      new Request("https://app.agentpay.example/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://app.agentpay.example" },
        body: huge,
      }),
    );
    expect(response.status).toBe(413);
  });

  it("returns 429 once the AUTH_CHALLENGE limit is hit", async () => {
    // AUTH_CHALLENGE default is 10/min/identity. Burn through it.
    for (let i = 0; i < 10; i += 1) {
      const r = await challengeHandler(jsonPost("https://app.agentpay.example/api/auth/challenge", { walletAddress: WALLET }));
      expect(r.status).toBe(200);
    }
    const blocked = await challengeHandler(jsonPost("https://app.agentpay.example/api/auth/challenge", { walletAddress: WALLET }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeDefined();
  });

  it("emits security headers on every protected response", async () => {
    const r = await challengeHandler(jsonPost("https://app.agentpay.example/api/auth/challenge", { walletAddress: WALLET }));
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("X-Frame-Options")).toBe("DENY");
    expect(r.headers.get("Content-Security-Policy")).toBeDefined();
  });

  it("rejects missing origin on state-changing requests with 403", async () => {
    const r = await challengeHandler(
      new Request("https://app.agentpay.example/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: WALLET }),
      }),
    );
    expect(r.status).toBe(403);
  });

  it("history returns 401 for unauthenticated callers", async () => {
    const r = await historyHandler(jsonGet("https://app.agentpay.example/api/payments/history"));
    expect(r.status).toBe(401);
  });

  it("authenticated history still works", async () => {
    const cookie = await signIn();
    const r = await historyHandler(jsonGet("https://app.agentpay.example/api/payments/history", cookie));
    expect(r.status).toBe(200);
  });

  it("does not leak internal headers on errors", async () => {
    const r = await challengeHandler(
      new Request("https://app.agentpay.example/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://app.agentpay.example" },
        body: "not json",
      }),
    );
    expect(r.headers.get("X-Powered-By")).toBeNull();
  });
});
