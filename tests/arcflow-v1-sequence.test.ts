/**
 * Phase 23.52 — ArcFlow V1 transaction-sequence regression tests.
 *
 * Covers the two Phase 23.51 findings and the fixes:
 *   1. percentage → basis-points conversion (80/20 → 8000/2000, exactly once)
 *   2. created flow id is decoded from the confirmed receipt, never guessed
 *   3. transaction ordering: createFlow → activateFlow → approve → executeSplit
 *   4. fail-closed: any failed/rejected step stops the sequence immediately
 *
 * The V1 address is configured on the environment (never in production) and
 * modules are re-imported per test so the module-load-time address is picked up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  toFunctionSelector,
  type Hex,
} from "viem";

const V1_ADDRESS = "0x3fB50a2aDc5FCba60274eDb976E12caDC6FDb8c2" as const;
const ENV_KEY = "NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS";

const TREASURY = "0x1111111111111111111111111111111111111111" as const;
const CONTRIBUTOR = "0x2222222222222222222222222222222222222222" as const;
const OWNER = "0x9999999999999999999999999999999999999999" as const;

const CREATE_SELECTOR = toFunctionSelector("createFlow(address,address,uint256,uint16,uint16)");
const ACTIVATE_SELECTOR = toFunctionSelector("activateFlow(uint256)");
const APPROVE_SELECTOR = toFunctionSelector("approve(address,uint256)");
const EXECUTE_SELECTOR = toFunctionSelector("executeSplit(uint256,uint256)");

const FLOW_CREATED = parseAbiItem(
  "event FlowCreated(uint256 indexed flowId, address indexed owner, address treasury, address contributor, uint256 threshold, uint16 treasuryBps, uint16 contributorBps)",
);

type Interactions = typeof import("@/lib/arcflow/interactions");
type DeployFlowModule = typeof import("@/lib/arcflow/deploy-flow");
type NetworkModule = typeof import("@/lib/arc/network");

let interactions: Interactions;
let deploy: DeployFlowModule;
let networkModule: NetworkModule;

beforeEach(async () => {
  process.env[ENV_KEY] = V1_ADDRESS;
  vi.resetModules();
  interactions = await import("@/lib/arcflow/interactions");
  deploy = await import("@/lib/arcflow/deploy-flow");
  networkModule = await import("@/lib/arc/network");
});

afterEach(() => {
  delete process.env[ENV_KEY];
});

/** Build a real, viem-encoded `FlowCreated` log. */
function makeFlowCreatedLog(args: {
  flowId: bigint;
  owner?: string;
  threshold?: bigint;
  treasuryBps?: number;
  contributorBps?: number;
  address?: string;
}) {
  const topics = encodeEventTopics({
    abi: [FLOW_CREATED],
    eventName: "FlowCreated",
    args: {
      flowId: args.flowId,
      owner: (args.owner ?? OWNER) as `0x${string}`,
    },
  }) as Hex[];

  const data = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint16" },
      { type: "uint16" },
    ],
    [
      TREASURY,
      CONTRIBUTOR,
      args.threshold ?? 10_000_000n,
      args.treasuryBps ?? 8000,
      args.contributorBps ?? 2000,
    ],
  );

  return { address: args.address ?? V1_ADDRESS, topics, data };
}

function selectorOf(data: string): string {
  return data.slice(0, 10);
}

// ============================================================
// 1. Percentage → basis points
// ============================================================

describe("percentToBasisPoints — conversion at the boundary", () => {
  it("converts 80 → 8000 and 20 → 2000", () => {
    expect(interactions.percentToBasisPoints(80)).toBe(8000);
    expect(interactions.percentToBasisPoints(20)).toBe(2000);
  });

  it("makes the default 80/20 split sum to exactly 10000 basis points", () => {
    const total =
      interactions.percentToBasisPoints(80) + interactions.percentToBasisPoints(20);
    expect(total).toBe(10000);
  });

  it("supports the valid extremes 0 and 100", () => {
    expect(interactions.percentToBasisPoints(0)).toBe(0);
    expect(interactions.percentToBasisPoints(100)).toBe(10000);
  });

  it("rejects an already-converted basis-point value (no double conversion)", () => {
    expect(() => interactions.percentToBasisPoints(8000)).toThrow(/basis points/i);
    expect(() => interactions.percentToBasisPoints(2000)).toThrow(/basis points/i);
  });

  it("rejects non-integer and out-of-range input", () => {
    expect(() => interactions.percentToBasisPoints(80.5)).toThrow(/whole number/i);
    expect(() => interactions.percentToBasisPoints(-1)).toThrow(/between 0 and 100/i);
    expect(() => interactions.percentToBasisPoints(101)).toThrow(/between 0 and 100/i);
  });

  it("encodes createFlow with basis points, not percentages", async () => {
    const { ARCFLOW_ABI } = await import("@/lib/arcflow/contract");
    const { decodeFunctionData } = await import("viem");

    const tx = interactions.prepareCreateFlowTx(
      {
        treasury: TREASURY,
        contributor: CONTRIBUTOR,
        threshold: "10.00",
        treasuryBps: interactions.percentToBasisPoints(80),
        contributorBps: interactions.percentToBasisPoints(20),
      },
      networkModule.ARC_MAINNET,
    );

    // The call targets the configured V1 contract with the createFlow selector.
    expect(tx.to.toLowerCase()).toBe(V1_ADDRESS.toLowerCase());
    expect(selectorOf(tx.data)).toBe(CREATE_SELECTOR);

    // The encoded basis points are 8000/2000 (NOT 80/20).
    const decoded = decodeFunctionData({ abi: ARCFLOW_ABI, data: tx.data as Hex });
    expect(decoded.functionName).toBe("createFlow");
    const [treasury, contributor, threshold, treasuryBps, contributorBps] = decoded.args as [
      string,
      string,
      bigint,
      number,
      number,
    ];
    expect(treasury.toLowerCase()).toBe(TREASURY.toLowerCase());
    expect(contributor.toLowerCase()).toBe(CONTRIBUTOR.toLowerCase());
    expect(threshold).toBe(10_000_000n);
    expect(treasuryBps).toBe(8000);
    expect(contributorBps).toBe(2000);
    expect(Number(treasuryBps) + Number(contributorBps)).toBe(10000);
  });
});

// ============================================================
// 2. Flow id extraction from the confirmed receipt
// ============================================================

describe("extractCreatedFlowId — decoded from the receipt, never guessed", () => {
  it("decodes the flow id from a real FlowCreated log", () => {
    const log = makeFlowCreatedLog({ flowId: 7n });
    const flowId = interactions.extractCreatedFlowId([log], networkModule.ARC_MAINNET);
    expect(flowId).toBe(7n);
  });

  it("decodes flowId 0 correctly (does not confuse 0 with missing)", () => {
    const log = makeFlowCreatedLog({ flowId: 0n });
    const flowId = interactions.extractCreatedFlowId([log], networkModule.ARC_MAINNET);
    expect(flowId).toBe(0n);
  });

  it("returns null for empty logs", () => {
    expect(interactions.extractCreatedFlowId([], networkModule.ARC_MAINNET)).toBeNull();
  });

  it("ignores a FlowCreated log emitted by a different contract", () => {
    const log = makeFlowCreatedLog({
      flowId: 3n,
      address: "0x000000000000000000000000000000000000dEaD",
    });
    expect(interactions.extractCreatedFlowId([log], networkModule.ARC_MAINNET)).toBeNull();
  });

  it("finds the FlowCreated event among unrelated logs", () => {
    const noise = {
      address: V1_ADDRESS,
      topics: ["0x" + "ab".repeat(32)] as Hex[],
      data: "0x" as Hex,
    };
    const target = makeFlowCreatedLog({ flowId: 12n });
    const flowId = interactions.extractCreatedFlowId(
      [noise, target],
      networkModule.ARC_MAINNET,
    );
    expect(flowId).toBe(12n);
  });
});

// ============================================================
// 2b. The confirmed receipt carries its logs through
// ============================================================

describe("classifyReceipt — carries confirmed logs (enables flow-id decode)", () => {
  it("keeps the logs of a successful receipt", async () => {
    const { classifyReceipt } = await import("@/lib/arc/payment");
    const log = makeFlowCreatedLog({ flowId: 42n });
    const outcome = classifyReceipt({
      transactionHash: `0x${"a".repeat(64)}`,
      status: "success",
      blockNumber: 1n,
      logs: [log],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.logs).toHaveLength(1);
      expect(interactions.extractCreatedFlowId(outcome.logs, networkModule.ARC_MAINNET)).toBe(42n);
    }
  });

  it("defaults to an empty log list when none are supplied", async () => {
    const { classifyReceipt } = await import("@/lib/arc/payment");
    const outcome = classifyReceipt({
      transactionHash: `0x${"a".repeat(64)}`,
      status: "success",
      blockNumber: 1n,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.logs).toEqual([]);
  });
});

// ============================================================
// 3. Transaction ordering
// ============================================================
function makeSender(options: {
  flowId?: bigint;
  failAtIndex?: number;
  omitFlowCreated?: boolean;
}) {
  const selectors: string[] = [];
  const sender = async (tx: { data: string }) => {
    const selector = selectorOf(tx.data);
    const index = selectors.length;
    selectors.push(selector);

    if (options.failAtIndex === index) {
      throw new Error(options.failAtIndex === 0 ? "User rejected transaction" : "Transaction failed");
    }

    const logs =
      selector === CREATE_SELECTOR && !options.omitFlowCreated
        ? [makeFlowCreatedLog({ flowId: options.flowId ?? 0n })]
        : [];

    return {
      transactionHash: `0x${"a".repeat(64)}` as `0x${string}`,
      blockNumber: BigInt(index + 1),
      logs,
    };
  };
  return { sender, selectors };
}

const FAR_ACTION = (percentage: number) => ({
  type: "TRANSFER" as const,
  recipient: percentage === 80 ? TREASURY : CONTRIBUTOR,
  percentage,
});

describe("deployFlow — ordering and fail-closed behaviour", () => {
  it("orders transactions create → activate → approve → executeSplit", async () => {
    const { sender, selectors } = makeSender({ flowId: 5n });

    const result = await deploy.deployFlow({
      flow: {
        condition: { operator: "GTE", amount: "10.00" },
        actions: [FAR_ACTION(80), FAR_ACTION(20)],
      },
      network: networkModule.ARC_MAINNET,
      sendTransaction: sender,
    });

    expect(selectors).toEqual([
      CREATE_SELECTOR,
      ACTIVATE_SELECTOR,
      APPROVE_SELECTOR,
      EXECUTE_SELECTOR,
    ]);
    expect(result.flowId).toBe(5n);
    expect(result.createTxHash).toMatch(/^0x/);
    expect(result.executeTxHash).toMatch(/^0x/);
  });

  it("activates the exact flow id decoded from the create receipt", async () => {
    const activated: bigint[] = [];
    const { sender } = makeSender({ flowId: 9n });

    // Wrap to capture the activateFlow argument.
    const wrapped = async (tx: { data: string; to: string }) => {
      if (selectorOf(tx.data) === ACTIVATE_SELECTOR) {
        // activateFlow(uint256) — first 32-byte word after the selector.
        activated.push(BigInt("0x" + tx.data.slice(10, 74)));
      }
      return sender(tx);
    };

    await deploy.deployFlow({
      flow: {
        condition: { operator: "GTE", amount: "10.00" },
        actions: [FAR_ACTION(80), FAR_ACTION(20)],
      },
      network: networkModule.ARC_MAINNET,
      sendTransaction: wrapped,
    });

    expect(activated).toEqual([9n]);
  });

  it("stops after a rejected createFlow — no later transaction is sent", async () => {
    const { sender, selectors } = makeSender({ failAtIndex: 0 });

    await expect(
      deploy.deployFlow({
        flow: {
          condition: { operator: "GTE", amount: "10.00" },
          actions: [FAR_ACTION(80), FAR_ACTION(20)],
        },
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
      }),
    ).rejects.toThrow(/rejected/i);

    expect(selectors).toEqual([CREATE_SELECTOR]);
  });

  it("stops after a failed activateFlow — approve/execute are never sent", async () => {
    const { sender, selectors } = makeSender({ flowId: 1n, failAtIndex: 1 });

    await expect(
      deploy.deployFlow({
        flow: {
          condition: { operator: "GTE", amount: "10.00" },
          actions: [FAR_ACTION(80), FAR_ACTION(20)],
        },
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
      }),
    ).rejects.toThrow(/failed/i);

    expect(selectors).toEqual([CREATE_SELECTOR, ACTIVATE_SELECTOR]);
  });

  it("stops after a failed approve — execute is never sent", async () => {
    const { sender, selectors } = makeSender({ flowId: 2n, failAtIndex: 2 });

    await expect(
      deploy.deployFlow({
        flow: {
          condition: { operator: "GTE", amount: "10.00" },
          actions: [FAR_ACTION(80), FAR_ACTION(20)],
        },
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
      }),
    ).rejects.toThrow(/failed/i);

    expect(selectors).toEqual([CREATE_SELECTOR, ACTIVATE_SELECTOR, APPROVE_SELECTOR]);
  });

  it("fails closed when the created flow id cannot be decoded from the receipt", async () => {
    const { sender, selectors } = makeSender({ omitFlowCreated: true });

    await expect(
      deploy.deployFlow({
        flow: {
          condition: { operator: "GTE", amount: "10.00" },
          actions: [FAR_ACTION(80), FAR_ACTION(20)],
        },
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
      }),
    ).rejects.toThrow(/flow id/i);

    // Only createFlow was attempted; no activation with a guessed id.
    expect(selectors).toEqual([CREATE_SELECTOR]);
  });

  it("refuses to start when recipients are missing", async () => {
    const { sender, selectors } = makeSender({ flowId: 0n });

    await expect(
      deploy.deployFlow({
        flow: { condition: { operator: "GTE", amount: "10.00" }, actions: [] },
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
      }),
    ).rejects.toThrow(/recipient/i);

    expect(selectors).toEqual([]);
  });
});
