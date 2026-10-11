/**
 * Phase 10.8 Blocker 3 — fail-closed gating for the unverified V2 address.
 *
 * Proves that no ArcFlow V2 authorization digest or typed data can be
 * constructed when NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS is unset —
 * the previously hardcoded unverified candidate (0xf0c80Fdd…) is unreachable.
 */
import { afterEach, describe, expect, it } from "vitest";

const ENV_KEY = "NEXT_PUBLIC_ARCFLOW_V2_CONTRACT_ADDRESS";

describe("Phase 10.8 — V2 address fail-closed gating", () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("throws when constructing a direct digest with no configured V2 address", async () => {
    delete process.env[ENV_KEY];
    const { computeArcFlowV2AuthorizationDigestDirect } = await import("@/lib/arcflow/authorization/arcflow-eip712");
    expect(() =>
      computeArcFlowV2AuthorizationDigestDirect({
        flowId: 0n,
        amount: 1_000_000n,
        validAfter: 0n,
        validBefore: 1_000_000_000n,
        nonce: ("0x" + "00".repeat(32)) as `0x${string}`,
      }),
    ).toThrow(/not configured/i);
  });

  it("throws when building typed data with no configured V2 address", async () => {
    delete process.env[ENV_KEY];
    const { buildArcFlowV2ExecuteTypedDataMessage } = await import("@/lib/arcflow/authorization/arcflow-eip712");
    expect(() =>
      buildArcFlowV2ExecuteTypedDataMessage({
        flowId: 0n,
        amount: 1_000_000n,
        validAfter: 0n,
        validBefore: 1_000_000_000n,
        nonce: ("0x" + "00".repeat(32)) as `0x${string}`,
      }),
    ).toThrow(/not configured/i);
  });

  it("succeeds and uses the configured address when one is set", async () => {
    const configured = "0x1111111111111111111111111111111111111111";
    process.env[ENV_KEY] = configured;
    const { buildArcFlowV2ExecuteTypedDataMessage } = await import("@/lib/arcflow/authorization/arcflow-eip712");
    const typed = buildArcFlowV2ExecuteTypedDataMessage({
      flowId: 0n,
      amount: 1_000_000n,
      validAfter: 0n,
      validBefore: 1_000_000_000n,
      nonce: ("0x" + "00".repeat(32)) as `0x${string}`,
    });
    expect(typed.domain.verifyingContract).toBe(configured);
    expect(typed.domain.name).toBe("ArcFlow");
    expect(typed.domain.version).toBe("1");
  });

  it("rejects malformed configured addresses", async () => {
    process.env[ENV_KEY] = "0x1234"; // too short
    const { buildArcFlowV2ExecuteTypedDataMessage } = await import("@/lib/arcflow/authorization/arcflow-eip712");
    expect(() =>
      buildArcFlowV2ExecuteTypedDataMessage({
        flowId: 0n,
        amount: 1_000_000n,
        validAfter: 0n,
        validBefore: 1_000_000_000n,
        nonce: ("0x" + "00".repeat(32)) as `0x${string}`,
      }),
    ).toThrow(/not configured/i);
  });
});
