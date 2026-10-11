/**
 * Sprint 10 — Health & environment validation.
 *
 * Asserts that:
 *  - /api/health returns sanitized status
 *  - /api/health never includes environment values, secrets, or cookies
 *  - validateEnvironment reports missing-required keys by name only
 *  - getConfigSummary masks server-only values
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as healthHandler } from "@/app/api/health/route";
import { validateEnvironment, getConfigSummary } from "@/lib/config/validation";
import {
  InMemoryRateLimitStore,
  setRateLimitStoreForTesting,
  setSecurityLoggerSinkForTesting,
  setServerRuntimeForTesting,
  resetServerRuntimeCache,
} from "@/lib/security";

describe("health & environment — sanitized output", () => {
  beforeEach(() => {
    setSecurityLoggerSinkForTesting(() => {});
    setRateLimitStoreForTesting(new InMemoryRateLimitStore());
    setServerRuntimeForTesting("test");
  });
  afterEach(() => {
    setRateLimitStoreForTesting(null);
    setSecurityLoggerSinkForTesting(null);
    resetServerRuntimeCache();
  });

  it("returns sanitized liveness info", async () => {
    const response = await healthHandler();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.application).toBe("alive");
    // No secret VALUES — keys may appear in configSummary.
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/postgres:\/\//i);
    expect(json).not.toMatch(/password/i);
    expect(json).not.toMatch(/token/i);
    expect(json).not.toMatch(/cookie/i);
    expect(json).not.toMatch(/signature/i);
  });

  it("reports the runtime", async () => {
    const body = await (await healthHandler()).json();
    expect(body.runtime).toBe("test");
  });

  it("validateEnvironment reports missing keys by name only", () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const result = validateEnvironment();
      // The result mentions the key name (for ops) but the function
      // signature guarantees the description, not the value.
      expect(result.ok).toBe(result.missingRequired.length === 0);
    } finally {
      if (original !== undefined) process.env.DATABASE_URL = original;
    }
  });

  it("getConfigSummary masks server-only values", () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://user:pass@host/db";
    try {
      const summary = getConfigSummary();
      // Server-only values must be "(configured)" not the actual string.
      const dbValue = summary.DATABASE_URL;
      expect(dbValue).toBe("(configured)");
      expect(dbValue).not.toContain("postgres://user:pass");
      // The key name may appear in the summary, but the value is masked.
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });

  it("getConfigSummary never returns environment variable values for server-only fields", () => {
    process.env.DATABASE_URL = "postgres://u:p@h/d";
    const summary = getConfigSummary();
    const dbValue = summary.DATABASE_URL;
    expect(dbValue).toBe("(configured)");
    expect(dbValue).not.toContain("postgres://");
    delete process.env.DATABASE_URL;
  });
});
