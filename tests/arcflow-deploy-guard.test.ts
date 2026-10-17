/**
 * Phase 48.1 — deployment safety regression tests.
 *
 * Covers the Phase 48 audit findings:
 *   1. single-flight + reconciliation gate for starting a deployment
 *      (duplicate submissions / blind restart after an unknown outcome)
 *   2. partial completion: progress patches are additive, so a later failure
 *      retains every confirmed tx hash and the created flow id
 *   3. unknown outcomes (timeout / RPC failure) propagate distinctly from
 *      confirmed reverts, and block a restart until acknowledged
 *   4. the four-transaction + exact-amount disclosure copy
 *
 * Mock senders are selector-keyed like tests/arcflow-v1-sequence.test.ts.
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

type DeployFlowModule = typeof import("@/lib/arcflow/deploy-flow");
type SendTxModule = typeof import("@/lib/arcflow/send-transaction");
type NetworkModule = typeof import("@/lib/arc/network");

let deploy: DeployFlowModule;
let sendTx: SendTxModule;
let networkModule: NetworkModule;

beforeEach(async () => {
  process.env[ENV_KEY] = V1_ADDRESS;
  vi.resetModules();
  deploy = await import("@/lib/arcflow/deploy-flow");
  sendTx = await import("@/lib/arcflow/send-transaction");
  networkModule = await import("@/lib/arc/network");
});

afterEach(() => {
  delete process.env[ENV_KEY];
});

/** Build a real, viem-encoded `FlowCreated` log (same shape as the sequence suite). */
function makeFlowCreatedLog(flowId: bigint) {
  const topics = encodeEventTopics({
    abi: [FLOW_CREATED],
    eventName: "FlowCreated",
    args: { flowId, owner: OWNER as `0x${string}` },
  }) as Hex[];

  const data = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint16" },
      { type: "uint16" },
    ],
    [TREASURY, CONTRIBUTOR, 10_000_000n, 8000, 2000],
  );

  return { address: V1_ADDRESS, topics, data };
}

function selectorOf(data: string): string {
  return data.slice(0, 10);
}

interface SenderOptions {
  /** Throws a confirmed-revert style error at this send index. */
  revertAtIndex?: number;
  /** Throws an UnknownTransactionOutcomeError at this send index. */
  unknownAtIndex?: number;
  flowId?: bigint;
  /** Confirmed create receipt with NO FlowCreated log (decode hard-stop). */
  omitFlowCreated?: boolean;
  /** Confirmed create receipt with an unrelated/malformed log. */
  malformedCreateLog?: boolean;
}

function makeSender(options: SenderOptions) {
  const selectors: string[] = [];
  const unknownError = new sendTx.UnknownTransactionOutcomeError(
    "Confirmation unknown — timed out waiting for the Arc transaction receipt.",
    `0x${"c".repeat(64)}` as `0x${string}`,
  );
  const sender = async (tx: { data: string }) => {
    const selector = selectorOf(tx.data);
    const index = selectors.length;
    selectors.push(selector);

    if (options.unknownAtIndex === index) {
      throw unknownError;
    }
    if (options.revertAtIndex === index) {
      throw new Error("The Arc transaction was mined but reverted. No payment was recorded.");
    }

    const malformedTopics: `0x${string}`[] = [
      ("0x" + "f".repeat(64)) as unknown as `0x${string}`,
    ];
    // Structural log shape (matches DeployReceiptLog) so both the viem-encoded
    // FlowCreated log and the plain malformed log are assignable.
    let logs: { address: string; topics: readonly string[]; data: string }[] =
      selector === CREATE_SELECTOR ? [makeFlowCreatedLog(options.flowId ?? 0n)] : [];
    if (selector === CREATE_SELECTOR) {
      if (options.malformedCreateLog) {
        // A log from the contract that is NOT a decodable FlowCreated event.
        logs = [{ address: V1_ADDRESS, topics: malformedTopics, data: "0x" + "0".repeat(64) }];
      } else if (options.omitFlowCreated) {
        logs = [];
      }
    }

    return {
      transactionHash: `0x${"a".repeat(64)}` as `0x${string}`,
      blockNumber: BigInt(index + 1),
      logs,
    };
  };
  return { sender, selectors, unknownError };
}

const FAR_ACTION = (percentage: number) => ({
  type: "TRANSFER" as const,
  recipient: percentage === 80 ? TREASURY : CONTRIBUTOR,
  percentage,
});

function makeFlow() {
  return {
    condition: { operator: "GTE" as const, amount: "10.00" },
    actions: [FAR_ACTION(80), FAR_ACTION(20)],
  };
}

/** Structural mirror of the component's DeploymentState for reducer tests. */
interface AccumulatedState {
  phase: string;
  flowId?: bigint;
  createTxHash?: string;
  activateTxHash?: string;
  approveTxHash?: string;
  executeTxHash?: string;
  failedPhase?: string;
  outcomeUnknown?: boolean;
  error?: string;
}

type ProgressPatch = Partial<AccumulatedState> & { phase: AccumulatedState["phase"] };

/** Replay progress patches through the same reducer the deployment UI uses. */
function accumulate(patches: ProgressPatch[]): AccumulatedState {
  let state: AccumulatedState = { phase: "idle" };
  for (const patch of patches) {
    state = deploy.applyDeploymentProgress(state, patch);
  }
  return state;
}

// ============================================================
// 1. Single-flight + reconciliation gate
// ============================================================

describe("canBeginDeployment — synchronous duplicate/unknown-outcome gate", () => {
  it("permits a start when no journey is in flight and nothing is unresolved", () => {
    expect(deploy.canBeginDeployment({ inFlight: false, unresolvedUnknown: null })).toEqual({ ok: true });
  });

  it("blocks a duplicate submission while a journey is in flight", () => {
    const gate = deploy.canBeginDeployment({ inFlight: true, unresolvedUnknown: null });
    expect(gate).toEqual({ ok: false, reason: "in-flight" });
  });

  it("blocks a blind restart while an unknown outcome is unresolved", () => {
    const unresolved = {
      transactionHash: `0x${"c".repeat(64)}` as `0x${string}`,
      phase: "execute" as const,
    };
    const gate = deploy.canBeginDeployment({ inFlight: false, unresolvedUnknown: unresolved });
    expect(gate).toEqual({ ok: false, reason: "unresolved-unknown" });
  });

  it("prefers the in-flight reason when both conditions hold", () => {
    const unresolved = {
      transactionHash: `0x${"c".repeat(64)}` as `0x${string}`,
      phase: "approve" as const,
    };
    const gate = deploy.canBeginDeployment({ inFlight: true, unresolvedUnknown: unresolved });
    expect(gate).toEqual({ ok: false, reason: "in-flight" });
  });

  it("permits a start again once the unknown outcome has been acknowledged", () => {
    // The UI clears `unresolvedUnknown` on explicit acknowledgment; the gate
    // must open again afterwards.
    const blocked = deploy.canBeginDeployment({
      inFlight: false,
      unresolvedUnknown: { transactionHash: `0x${"c".repeat(64)}`, phase: "execute" },
    });
    expect(blocked.ok).toBe(false);
    const cleared = deploy.canBeginDeployment({ inFlight: false, unresolvedUnknown: null });
    expect(cleared).toEqual({ ok: true });
  });
});

// ============================================================
// 2. Partial completion — later failure keeps earlier evidence
// ============================================================

describe("partial completion — progress patches are additive", () => {
  it("retains confirmed hashes and the flow id when executeSplit reverts", async () => {
    const { sender, selectors } = makeSender({ flowId: 7n, revertAtIndex: 3 });

    const patches: ProgressPatch[] = [];
    await expect(
      deploy.deployFlow({
        flow: makeFlow(),
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
        onProgress: (p) => patches.push(p),
      }),
    ).rejects.toThrow("reverted");

    // All four transactions were submitted; only the last one reverted.
    expect(selectors).toEqual([CREATE_SELECTOR, ACTIVATE_SELECTOR, APPROVE_SELECTOR, EXECUTE_SELECTOR]);

    const state = accumulate(patches);
    expect(state.phase).toBe("execute");
    expect(state.flowId).toBe(7n);
    expect(state.createTxHash).toMatch(/^0x/);
    expect(state.activateTxHash).toMatch(/^0x/);
    expect(state.approveTxHash).toMatch(/^0x/);
    expect(state.executeTxHash).toBeUndefined(); // the failed step has no confirmed hash
  });

  it("retains only the create hash when activation reverts", async () => {
    const { sender, selectors } = makeSender({ flowId: 3n, revertAtIndex: 1 });

    const patches: ProgressPatch[] = [];
    await expect(
      deploy.deployFlow({
        flow: makeFlow(),
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
        onProgress: (p) => patches.push(p),
      }),
    ).rejects.toThrow("reverted");

    expect(selectors).toEqual([CREATE_SELECTOR, ACTIVATE_SELECTOR]);
    const state = accumulate(patches);
    expect(state.phase).toBe("activate");
    expect(state.flowId).toBe(3n);
    expect(state.createTxHash).toMatch(/^0x/);
    expect(state.activateTxHash).toBeUndefined();
    expect(state.approveTxHash).toBeUndefined();
    expect(state.executeTxHash).toBeUndefined();
  });

  it("an error-state merge keeps the retained evidence (UI error-patch semantics)", () => {
    // Mirror the component: accumulate progress, then apply the error patch.
    let state: Record<string, unknown> & { phase: string } = { phase: "idle" };
    state = deploy.applyDeploymentProgress(state, {
      phase: "execute",
      flowId: 7n,
      createTxHash: `0x${"a".repeat(64)}`,
      activateTxHash: `0x${"b".repeat(64)}`,
      approveTxHash: `0x${"d".repeat(64)}`,
    });
    state = deploy.applyDeploymentProgress(state, {
      phase: "error",
      failedPhase: "execute",
      error: "The Arc transaction was mined but reverted.",
    });
    expect(state.phase).toBe("error");
    expect(state.failedPhase).toBe("execute");
    expect(state.flowId).toBe(7n);
    expect(state.createTxHash).toMatch(/^0x/);
    expect(state.activateTxHash).toMatch(/^0x/);
    expect(state.approveTxHash).toMatch(/^0x/);
  });
});

// ============================================================
// 3. Unknown outcome — distinct from revert; journey stops
// ============================================================

describe("unknown outcomes — propagate distinctly and stop the sequence", () => {
  it("propagates the UnknownTransactionOutcomeError identity and sends nothing further", async () => {
    const { sender, selectors, unknownError } = makeSender({ flowId: 2n, unknownAtIndex: 2 });

    let caught: unknown;
    try {
      await deploy.deployFlow({
        flow: makeFlow(),
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
      });
    } catch (error) {
      caught = error;
    }

    // The exact error instance surfaces (unknown ≠ confirmed revert).
    expect(caught).toBe(unknownError);
    expect((caught as { kind?: string }).kind).toBe("unknown-outcome");
    // create + activate were submitted; approve was submitted and its outcome
    // went unknown; executeSplit must NOT have been sent.
    expect(selectors).toEqual([CREATE_SELECTOR, ACTIVATE_SELECTOR, APPROVE_SELECTOR]);
  });

  it("carries the submitted hash for reconciliation", () => {
    const err = new sendTx.UnknownTransactionOutcomeError(
      "Confirmation unknown — timed out.",
      `0x${"e".repeat(64)}` as `0x${string}`,
    );
    expect(err.transactionHash).toBe(`0x${"e".repeat(64)}`);
    expect(err.name).toBe("UnknownTransactionOutcomeError");
  });
});

// ============================================================
// 5. Create-receipt evidence survives flow-id decode failure (F2)
// ============================================================

describe("create receipt evidence — Phase 48.4 finding F2", () => {  it("missing FlowCreated event: confirmed hash is retained, message says the tx succeeded, nothing further is sent", async () => {
    const { sender, selectors } = makeSender({ flowId: 9n, omitFlowCreated: true });

    const patches: ProgressPatch[] = [];
    let caught: unknown;
    try {
      await deploy.deployFlow({
        flow: makeFlow(),
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
        onProgress: (p) => patches.push(p),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("succeeded on-chain");
    expect(message).toContain("Stopping before any further transaction");
    expect(message).toContain(`0x${"a".repeat(64)}`); // the confirmed create hash

    // The confirmed create hash surfaced through progress BEFORE the failure.
    const state = accumulate(patches);
    expect(state.phase).toBe("create");
    expect(state.createTxHash).toBe(`0x${"a".repeat(64)}`);

    // Hard stop: only the create transaction was ever submitted.
    expect(selectors).toEqual([CREATE_SELECTOR]);
  });

  it("malformed event log: same hard stop with the confirmed hash retained", async () => {
    const { sender, selectors } = makeSender({ flowId: 4n, malformedCreateLog: true });

    const patches: ProgressPatch[] = [];
    await expect(
      deploy.deployFlow({
        flow: makeFlow(),
        network: networkModule.ARC_MAINNET,
        sendTransaction: sender,
        onProgress: (p) => patches.push(p),
      }),
    ).rejects.toThrow("succeeded on-chain");

    const state = accumulate(patches);
    expect(state.createTxHash).toBe(`0x${"a".repeat(64)}`);
    expect(state.flowId).toBeUndefined(); // never guessed
    expect(selectors).toEqual([CREATE_SELECTOR]);
  });

  it("unknown-outcome and restored-session copy never claim failure", () => {
    const panel = deploy.UNKNOWN_OUTCOME_DISCLOSURE;
    expect(panel).toContain("NOT been confirmed as failed");
    expect(panel).toContain("may still confirm on Arc");
    expect(panel).toContain("do not resubmit blindly");
    expect(panel).toContain("blocked until you acknowledge");

    const restored = deploy.RESTORED_UNKNOWN_OUTCOME_ERROR;
    expect(restored).toContain("not a confirmed failure");
    expect(restored).toContain("may still confirm on Arc");
    expect(restored).not.toMatch(/transaction (was |has )?failed/i);
    expect(restored).toContain("No new transaction has been sent since");
  });
});


// ============================================================
// 6. Disclosure copy — four transactions + exact amount + unknown outcome
// ============================================================

describe("deployment disclosure copy", () => {
  it("lists exactly the four on-chain transactions in order", () => {
    expect(deploy.DEPLOYMENT_DISCLOSURE_STEPS).toHaveLength(4);
    const [first, second, third, fourth] = deploy.DEPLOYMENT_DISCLOSURE_STEPS;
    expect(first.toLowerCase()).toContain("create");
    expect(second.toLowerCase()).toContain("activate");
    expect(third.toLowerCase()).toContain("approve");
    expect(fourth.toLowerCase()).toContain("execute");
  });

  it("states that the threshold amount is executed exactly, manually, with no automation", () => {
    const copy = deploy.EXECUTION_AMOUNT_DISCLOSURE.toLowerCase();
    expect(copy).toContain("exactly the threshold amount");
    expect(copy).toContain("never executes automatically");
    expect(copy).toContain("manually");
  });
});
