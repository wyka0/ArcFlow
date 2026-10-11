/**
 * Sprint 10 — Structured security logger.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  logSecurityEvent,
  setSecurityLoggerSinkForTesting,
  type SecurityEvent,
} from "@/lib/security/logger";

describe("security/logger — structured event sink", () => {
  let captured: Array<SecurityEvent & { timestamp: string }> = [];

  beforeEach(() => {
    captured = [];
    setSecurityLoggerSinkForTesting((event) => {
      captured.push(event);
    });
  });
  afterEach(() => {
    setSecurityLoggerSinkForTesting(null);
  });

  it("captures events with a timestamp", () => {
    logSecurityEvent({ kind: "AUTH_CHALLENGE_CREATED", keyHash: "abc12345" });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.kind).toBe("AUTH_CHALLENGE_CREATED");
    expect(captured[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("redacts detail strings that contain sensitive markers", () => {
    logSecurityEvent({
      kind: "AUTH_VERIFY_FAILURE",
      detail: "header was authorization: Bearer abcdef",
    });
    expect(captured[0]?.detail).toBe("[redacted]");
  });

  it("redacts detail strings that mention a private key", () => {
    logSecurityEvent({
      kind: "AUTH_VERIFY_FAILURE",
      detail: "saw a private key in the body",
    });
    expect(captured[0]?.detail).toBe("[redacted]");
  });

  it("redacts detail strings that mention a seed phrase", () => {
    logSecurityEvent({
      kind: "AUTH_VERIFY_FAILURE",
      detail: "leaked a seed phrase accidentally",
    });
    expect(captured[0]?.detail).toBe("[redacted]");
  });

  it("redacts detail strings that mention a signature", () => {
    logSecurityEvent({
      kind: "AUTH_VERIFY_FAILURE",
      detail: "unexpected signature 0xabc",
    });
    expect(captured[0]?.detail).toBe("[redacted]");
  });

  it("redacts Set-Cookie", () => {
    logSecurityEvent({
      kind: "AUTH_LOGOUT",
      detail: "Set-Cookie: agentpay_session=...",
    });
    expect(captured[0]?.detail).toBe("[redacted]");
  });

  it("truncates long detail strings", () => {
    const long = "a".repeat(500);
    logSecurityEvent({ kind: "RATE_LIMITED", detail: long });
    expect((captured[0]?.detail ?? "").length).toBeLessThanOrEqual(220);
  });

  it("does not throw when the sink throws", () => {
    setSecurityLoggerSinkForTesting(() => {
      throw new Error("sink failure");
    });
    expect(() => logSecurityEvent({ kind: "RATE_LIMITED" })).not.toThrow();
  });

  it("emits events for every documented kind", () => {
    const kinds = [
      "AUTH_CHALLENGE_CREATED",
      "AUTH_VERIFY_SUCCESS",
      "AUTH_VERIFY_FAILURE",
      "AUTH_SESSION_CREATED",
      "AUTH_LOGOUT",
      "RATE_LIMITED",
      "RATE_LIMITER_UNAVAILABLE",
      "PAYMENT_INTENT_REJECTED",
      "PAYMENT_VERIFY_REJECTED",
      "OWNERSHIP_REJECTED",
      "SERVICE_FULFILLMENT_REJECTED",
      "CONFIGURATION_ERROR",
      "EXTERNAL_PROVIDER_ERROR",
      "BODY_TOO_LARGE",
      "ORIGIN_REJECTED",
      "RECIPIENT_REJECTED",
    ] as const;
    for (const kind of kinds) {
      logSecurityEvent({ kind });
      expect(captured.some((c) => c.kind === kind)).toBe(true);
    }
  });
});
