/**
 * Sprint 10 — Security headers.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySecurityHeaders,
  buildSecurityHeaders,
  getServerRuntime,
  resetServerRuntimeCache,
  setServerRuntimeForTesting,
} from "@/lib/security";

describe("security/headers", () => {
  beforeEach(() => {
    setServerRuntimeForTesting("production");
  });
  afterEach(() => {
    resetServerRuntimeCache();
  });

  it("always returns X-Content-Type-Options nosniff", () => {
    const h = buildSecurityHeaders();
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("always sets Referrer-Policy to strict-origin-when-cross-origin", () => {
    const h = buildSecurityHeaders();
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("always sets X-Frame-Options DENY", () => {
    const h = buildSecurityHeaders();
    expect(h["X-Frame-Options"]).toBe("DENY");
  });

  it("always sets Permissions-Policy with payment disabled", () => {
    const h = buildSecurityHeaders();
    expect(h["Permissions-Policy"]).toContain("payment=()");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Permissions-Policy"]).toContain("microphone=()");
  });

  it("sets a strict CSP in production without unsafe-eval", () => {
    const h = buildSecurityHeaders();
    const csp = h["Content-Security-Policy"];
    expect(csp).toBeDefined();
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  it("includes HSTS in production", () => {
    const h = buildSecurityHeaders();
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=31536000/);
  });

  it("switches to a permissive CSP in development", () => {
    setServerRuntimeForTesting("development");
    const h = buildSecurityHeaders();
    expect(h["Content-Security-Policy"]).toContain("unsafe-eval");
  });

  it("omits HSTS outside production", () => {
    setServerRuntimeForTesting("development");
    const h = buildSecurityHeaders();
    expect(h["Strict-Transport-Security"]).toBeUndefined();
  });

  it("applySecurityHeaders writes the headers to a response", () => {
    const headers = new Headers();
    const response = { headers };
    applySecurityHeaders(response);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toBeDefined();
  });

  it("getServerRuntime returns the cached value", () => {
    expect(getServerRuntime()).toBe("production");
  });
});
