/**
 * Phase 25 — V1 on-chain flow reading (read-only).
 *
 * Covers ABI decoding/mapping, basis-point and USDC formatting, and the
 * critical invariant that an RPC failure is never disguised as an empty list or
 * a zero count. Uses mocked clients only — no network, no transactions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";

const V1 = "0x3fB50a2aDc5FCba60274eDb976E12caDC6FDb8c2" as const;
const OWNER = "0x1111111111111111111111111111111111111111" as const;
const ENV_KEY = "NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS";

type Interactions = typeof import("@/lib/arcflow/interactions");
type NetworkModule = typeof import("@/lib/arc/network");
type FormatModule = typeof import("@/lib/arcflow/flow-format");

let interactions: Interactions;
let networks: NetworkModule;
let format: FormatModule;

function mockClient(readContract: (args: unknown) => Promise<unknown>): PublicClient {
  return { readContract: vi.fn(readContract) } as unknown as PublicClient;
}

function revertError(): Error {
  return Object.assign(new Error("execution reverted: FlowNotFound"), {
    name: "ContractFunctionRevertedError",
  });
}

async function loadConfigured(): Promise<void> {
  process.env[ENV_KEY] = V1;
  vi.resetModules();
  interactions = await import("@/lib/arcflow/interactions");
  networks = await import("@/lib/arc/network");
  format = await import("@/lib/arcflow/flow-format");
}

async function loadUnconfigured(): Promise<void> {
  delete process.env[ENV_KEY];
  vi.resetModules();
  interactions = await import("@/lib/arcflow/interactions");
  networks = await import("@/lib/arc/network");
  format = await import("@/lib/arcflow/flow-format");
}

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.resetModules();
});

// ============================================================
// Formatting helpers (pure)
// ============================================================
describe("flow formatting", () => {
  beforeEach(async () => {
    await loadConfigured();
  });

  it("converts basis points to percentages", () => {
    expect(format.formatBasisPointsPercent(8000)).toBe("80%");
    expect(format.formatBasisPointsPercent(2000)).toBe("20%");
    expect(format.formatBasisPointsPercent(8050)).toBe("80.5%");
    expect(format.formatBasisPointsPercent(0)).toBe("0%");
    expect(format.formatBasisPointsPercent(10000)).toBe("100%");
  });

  it("formats 6-decimal USDC base units", () => {
    expect(format.formatFlowUsdc(10000n)).toBe("0.01 USDC");
    expect(format.formatFlowUsdc(0n)).toBe("0.00 USDC");
    expect(format.formatFlowUsdc(1_000_000n)).toBe("1.00 USDC");
  });

  it("labels flow status", () => {
    expect(format.flowStatusLabel(true)).toBe("Active");
    expect(format.flowStatusLabel(false)).toBe("Paused");
  });

  it("parses valid flow IDs and rejects invalid ones", () => {
    expect(format.parseFlowId("0")).toBe(0n);
    expect(format.parseFlowId("12")).toBe(12n);
    expect(format.parseFlowId(" 3 ")).toBe(3n);
    expect(format.parseFlowId("-1")).toBeNull();
    expect(format.parseFlowId("1.5")).toBeNull();
    expect(format.parseFlowId("abc")).toBeNull();
    expect(format.parseFlowId("")).toBeNull();
    expect(format.parseFlowId(undefined)).toBeNull();
  });
});

// ============================================================
// readFlow
// ============================================================
describe("readFlow", () => {
  beforeEach(async () => {
    await loadConfigured();
  });

  it("maps a named getFlow result to a typed ContractFlow", async () => {
    const client = mockClient(async () => ({
      owner: OWNER,
      treasury: "0x2222222222222222222222222222222222222222",
      contributor: "0x3333333333333333333333333333333333333333",
      treasuryBps: 8000,
      contributorBps: 2000,
      threshold: 10000n,
      active: true,
    }));
    const result = await interactions.readFlow(1n, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flow.treasuryBps).toBe(8000);
      expect(result.flow.contributorBps).toBe(2000);
      expect(result.flow.threshold).toBe(10000n); // bigint preserved
      expect(result.flow.active).toBe(true);
      expect(result.flow.owner).toBe(OWNER);
    }
  });

  it("maps a positional tuple getFlow result", () => {
    const flow = interactions.mapContractFlow([
      OWNER,
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
      8000n,
      2000n,
      500n,
      false,
    ]);
    expect(flow.treasuryBps).toBe(8000);
    expect(flow.threshold).toBe(500n);
    expect(flow.active).toBe(false);
  });

  it("reports NOT_FOUND on a reverted read", async () => {
    const client = mockClient(async () => {
      throw revertError();
    });
    const result = await interactions.readFlow(99n, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_FOUND");
  });

  it("reports RPC_ERROR (never a fabricated flow) on a transport failure", async () => {
    const client = mockClient(async () => {
      throw new Error("fetch failed");
    });
    const result = await interactions.readFlow(1n, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("RPC_ERROR");
  });

  it("rejects a negative flow id as INVALID_INPUT without touching the chain", async () => {
    const readContract = vi.fn(async () => ({}));
    const client = mockClient(readContract);
    const result = await interactions.readFlow(-1n, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID_INPUT");
    expect(readContract).not.toHaveBeenCalled();
  });
});

// ============================================================
// readFlowsByOwner
// ============================================================
describe("readFlowsByOwner", () => {
  beforeEach(async () => {
    await loadConfigured();
  });

  it("returns the owner's flow IDs", async () => {
    const client = mockClient(async () => [1n, 2n, 5n]);
    const result = await interactions.readFlowsByOwner(OWNER, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.flowIds).toEqual([1n, 2n, 5n]);
  });

  it("returns an explicit empty list only on a successful empty read", async () => {
    const client = mockClient(async () => []);
    const result = await interactions.readFlowsByOwner(OWNER, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.flowIds).toEqual([]);
  });

  it("reports RPC_ERROR — never an empty list — when the read fails", async () => {
    const client = mockClient(async () => {
      throw new Error("network down");
    });
    const result = await interactions.readFlowsByOwner(OWNER, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("RPC_ERROR");
  });

  it("rejects an invalid owner address as INVALID_INPUT without touching the chain", async () => {
    const readContract = vi.fn(async () => []);
    const client = mockClient(readContract);
    const badOwner = "not-an-address" as unknown as `0x${string}`;
    const result = await interactions.readFlowsByOwner(badOwner, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID_INPUT");
    expect(readContract).not.toHaveBeenCalled();
  });
});

// ============================================================
// readFlowCount
// ============================================================
describe("readFlowCount", () => {
  beforeEach(async () => {
    await loadConfigured();
  });

  it("returns the on-chain count", async () => {
    const client = mockClient(async () => 7n);
    const result = await interactions.readFlowCount(client, networks.ARC_MAINNET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.count).toBe(7n);
  });

  it("reports RPC_ERROR — never a fake 0 — when the read fails", async () => {
    const client = mockClient(async () => {
      throw new Error("boom");
    });
    const result = await interactions.readFlowCount(client, networks.ARC_MAINNET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("RPC_ERROR");
  });
});

// ============================================================
// Missing configuration — fail closed
// ============================================================
describe("missing contract configuration", () => {
  beforeEach(async () => {
    await loadUnconfigured();
  });

  it("readFlow fails closed as NOT_CONFIGURED without touching the chain", async () => {
    const readContract = vi.fn(async () => ({}));
    const client = mockClient(readContract);
    const result = await interactions.readFlow(0n, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_CONFIGURED");
    expect(readContract).not.toHaveBeenCalled();
  });

  it("readFlowsByOwner fails closed as NOT_CONFIGURED", async () => {
    const client = mockClient(async () => []);
    const result = await interactions.readFlowsByOwner(OWNER, client, networks.ARC_MAINNET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_CONFIGURED");
  });

  it("readFlowCount fails closed as NOT_CONFIGURED", async () => {
    const client = mockClient(async () => 0n);
    const result = await interactions.readFlowCount(client, networks.ARC_MAINNET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_CONFIGURED");
  });
});
