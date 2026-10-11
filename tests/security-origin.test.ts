/**
 * Sprint 10 — Origin / same-site request validation.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getCanonicalOrigin,
  validateRequestOrigin,
} from "@/lib/security/origin";
import {
  resetServerRuntimeCache,
  setServerRuntimeForTesting,
} from "@/lib/security/env";

function req(origin?: string | null, referer?: string | null, host?: string): Request {
  const headers: Record<string, string> = {};
  if (origin) headers["origin"] = origin;
  if (referer) headers["referer"] = referer;
  if (host) headers["host"] = host;
  return new Request("https://app.agentpay.example/api/x", { headers });
}

describe("security/origin", () => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.AUTH_CANONICAL_ORIGIN;
    setServerRuntimeForTesting("production");
  });
  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_CANONICAL_ORIGIN;
    else process.env.AUTH_CANONICAL_ORIGIN = original;
    resetServerRuntimeCache();
  });

  it("accepts same-origin when canonical is configured", () => {
    process.env.AUTH_CANONICAL_ORIGIN = "https://app.agentpay.example";
    const decision = validateRequestOrigin(req("https://app.agentpay.example"));
    expect(decision.ok).toBe(true);
  });

  it("rejects cross-origin requests with ORIGIN_MISMATCH", () => {
    process.env.AUTH_CANONICAL_ORIGIN = "https://app.agentpay.example";
    const decision = validateRequestOrigin(req("https://attacker.example"));
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("ORIGIN_MISMATCH");
  });

  it("rejects requests with no Origin/Referer in production when canonical is set", () => {
    process.env.AUTH_CANONICAL_ORIGIN = "https://app.agentpay.example";
    const decision = validateRequestOrigin(req());
    expect(decision.ok).toBe(false);
  });

  it("accepts Referer as a fallback for the same origin", () => {
    process.env.AUTH_CANONICAL_ORIGIN = "https://app.agentpay.example";
    const decision = validateRequestOrigin(req(null, "https://app.agentpay.example/page"));
    expect(decision.ok).toBe(true);
  });

  it("rejects when no canonical is set in production", () => {
    delete process.env.AUTH_CANONICAL_ORIGIN;
    const decision = validateRequestOrigin(req("https://app.agentpay.example"));
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("MISSING_ORIGIN");
  });

  it("accepts the request origin in non-production when no canonical is set", () => {
    delete process.env.AUTH_CANONICAL_ORIGIN;
    setServerRuntimeForTesting("development");
    const decision = validateRequestOrigin(req("https://app.agentpay.example"));
    expect(decision.ok).toBe(true);
  });

  it("getCanonicalOrigin returns null when no env is set", () => {
    delete process.env.AUTH_CANONICAL_ORIGIN;
    expect(getCanonicalOrigin()).toBeNull();
  });

  it("getCanonicalOrigin trims trailing slashes", () => {
    process.env.AUTH_CANONICAL_ORIGIN = "https://app.agentpay.example/";
    expect(getCanonicalOrigin()).toBe("https://app.agentpay.example");
  });
});
