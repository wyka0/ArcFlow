/**
 * Sprint 10 — Production recipient validation.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveProductionRecipient } from "@/lib/security/recipients";
import { setServerRuntimeForTesting, resetServerRuntimeCache } from "@/lib/security/env";
import { setSecurityLoggerSinkForTesting } from "@/lib/security/logger";

const REAL_ADDRESS = "0xAbC1234567890aBcD1234567890abcD123456789";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("security/recipients — production validation", () => {
  const original: Record<string, string | undefined> = {};
  const KEYS = [
    "NEXT_PUBLIC_AGENTPAY_MARKET_DATA_RECIPIENT",
    "NEXT_PUBLIC_AGENTPAY_RESEARCH_REPORT_RECIPIENT",
    "NEXT_PUBLIC_AGENTPAY_AI_SUMMARY_RECIPIENT",
  ];

  beforeEach(() => {
    for (const k of KEYS) original[k] = process.env[k];
    setSecurityLoggerSinkForTesting(() => {});
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    resetServerRuntimeCache();
    setSecurityLoggerSinkForTesting(null);
  });

  it("in production, a zero/unconfigured address is reported unconfigured", () => {
    setServerRuntimeForTesting("production");
    process.env.NEXT_PUBLIC_AGENTPAY_MARKET_DATA_RECIPIENT = ZERO_ADDRESS;
    const result = resolveProductionRecipient("market-data");
    expect(result.status).toBe("unconfigured");
    expect(result.address).toBeNull();
  });

  it("in production, a real address is reported configured", () => {
    setServerRuntimeForTesting("production");
    process.env.NEXT_PUBLIC_AGENTPAY_MARKET_DATA_RECIPIENT = REAL_ADDRESS;
    const result = resolveProductionRecipient("market-data");
    expect(result.status).toBe("configured");
    // The address is returned in its original case (checksummed form).
    // We accept either the original or lowercase - the important part is it's the configured value.
    expect(result.address).toBeDefined();
    expect(result.address?.toLowerCase()).toBe(REAL_ADDRESS.toLowerCase());
  });

  it("in development, a missing address is still marked unconfigured", () => {
    setServerRuntimeForTesting("development");
    delete process.env.NEXT_PUBLIC_AGENTPAY_MARKET_DATA_RECIPIENT;
    const result = resolveProductionRecipient("market-data");
    expect(result.status).toBe("unconfigured");
    expect(result.isDevelopment).toBe(true);
  });

  it("emits a structured log when production rejects a recipient", () => {
    setServerRuntimeForTesting("production");
    process.env.NEXT_PUBLIC_AGENTPAY_MARKET_DATA_RECIPIENT = ZERO_ADDRESS;
    const captured: string[] = [];
    setSecurityLoggerSinkForTesting((event) => {
      captured.push(JSON.stringify(event));
    });
    resolveProductionRecipient("market-data", { identityKey: "0xtest" });
    const joined = captured.join("\n");
    expect(joined).toContain("RECIPIENT_REJECTED");
  });
});
