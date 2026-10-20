/**
 * Flow-execution service tests — the verification pipeline, ownership, and
 * idempotency.
 *
 * No network and no database: the chain reader is injected and the trusted
 * repository is the in-memory adapter. `NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS`
 * is set before the modules are imported (and modules are re-imported per
 * test), matching the established ArcFlow test pattern.
 */
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TEST_CONTRACT,
  TX_HASH_A,
  TX_HASH_B,
  defaultOnChainFlow,
  defaultSplit,
  makeFlowChainReader,
  makeFlowExecutionRecord,
  makeReceipt,
  splitLogs,
  uppercaseHash,
} from "./flow-execution-fixtures";

const ENV_KEY = "NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS";

const userA = privateKeyToAccount(`0x${"1".repeat(64)}` as `0x${string}`);
const userB = privateKeyToAccount(`0x${"2".repeat(64)}` as `0x${string}`);

const OWNER_A = userA.address;
const OWNER_B = userB.address;

type ServiceModule = typeof import("@/lib/payments/server/service");
type FactoryModule = typeof import("@/lib/payments/server/factory");

let service: ServiceModule;
let factory: FactoryModule;

const splitA = defaultSplit({ owner: OWNER_A });
const flowA = defaultOnChainFlow({ owner: OWNER_A });

function receiptA(overrides: Parameters<typeof makeReceipt>[0] = {}) {
  return makeReceipt({ from: OWNER_A, logs: splitLogs(splitA), ...overrides });
}

beforeEach(async () => {
  process.env[ENV_KEY] = TEST_CONTRACT;
  vi.resetModules();
  service = await import("@/lib/payments/server/service");
  factory = await import("@/lib/payments/server/factory");
  factory.setTrustedRepositoryForTesting(factory.createInMemoryTrustedRepository());
});

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.resetModules();
});

describe("verifyFlowExecution — service pipeline", () => {
  it("rejects without a session wallet and records nothing", async () => {
    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: null,
      chain: makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "ok", flow: flowA } }),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "UNAUTHENTICATED",
      message: expect.any(String),
    });
    expect(await service.getTrustedFlowExecutions()).toEqual([]);
  });

  it("verifies and records a valid execution", async () => {
    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "ok", flow: flowA } }),
    });

    expect(outcome.status).toBe("verified");
    if (outcome.status !== "verified") return;
    expect(outcome.alreadyRecorded).toBe(false);
    expect(outcome.record.kind).toBe("flow_execution");
    expect(outcome.record.txHash).toBe(TX_HASH_A);
    expect(outcome.record.flowId).toBe("1");
    expect(outcome.record.chainId).toBe(5042);
    expect(outcome.record.blockNumber).toBe("123456");
    expect(outcome.record.ownerWalletAddress.toLowerCase()).toBe(OWNER_A.toLowerCase());
    expect(outcome.record.sender.toLowerCase()).toBe(OWNER_A.toLowerCase());
    expect(outcome.record.totalAmountBaseUnits).toBe("10000");
    expect(outcome.record.treasuryAmountBaseUnits).toBe("8000");
    expect(outcome.record.contributorAmountBaseUnits).toBe("2000");

    const stored = await service.getTrustedFlowExecutions({ ownerWalletAddress: OWNER_A });
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(outcome.record.id);
  });

  it("is idempotent for the same verified hash", async () => {
    const reader = () =>
      makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "ok", flow: flowA } });

    const first = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: reader(),
    });
    const second = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: reader(),
    });

    expect(first.status).toBe("verified");
    expect(second.status).toBe("verified");
    if (first.status !== "verified" || second.status !== "verified") return;
    expect(second.alreadyRecorded).toBe(true);
    expect(second.record.id).toBe(first.record.id);
    expect(await service.getTrustedFlowExecutions()).toHaveLength(1);
  });

  it("treats a case-variant resubmission as the same record (canonical hash)", async () => {
    const reader = () =>
      makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "ok", flow: flowA } });

    const first = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: reader(),
    });
    const second = await service.verifyFlowExecution({
      txHash: uppercaseHash(TX_HASH_A),
      authenticatedWallet: OWNER_A,
      chain: reader(),
    });

    expect(first.status).toBe("verified");
    expect(second.status).toBe("verified");
    if (first.status !== "verified" || second.status !== "verified") return;
    expect(second.alreadyRecorded).toBe(true);
    expect(second.record.id).toBe(first.record.id);
    // The persisted record carries the canonical lowercase hash.
    expect(second.record.txHash).toBe(TX_HASH_A);
    expect(await service.getTrustedFlowExecutions()).toHaveLength(1);
  });

  it("records nothing when the receipt belongs to a different transaction", async () => {
    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({
        receipt: makeReceipt({
          transactionHash: TX_HASH_B,
          from: OWNER_A,
          logs: splitLogs(splitA),
        }),
        flowResult: { status: "ok", flow: flowA },
      }),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "RECEIPT_HASH_MISMATCH",
      message: expect.any(String),
    });
    expect(await service.getTrustedFlowExecutions()).toEqual([]);
  });

  it("refuses to reveal a hash recorded by another wallet", async () => {
    await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "ok", flow: flowA } }),
    });

    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_B,
      chain: makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "ok", flow: flowA } }),
    });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.reason).toBe("FORBIDDEN");
  });

  it("rejects when the flow is not found on-chain", async () => {
    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "not_found" } }),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "FLOW_NOT_FOUND",
      message: expect.any(String),
    });
  });

  it("rejects when the chain read is unavailable", async () => {
    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "unavailable" } }),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "CHAIN_UNAVAILABLE",
      message: expect.any(String),
    });
  });

  it("rejects when no receipt exists", async () => {
    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({ receipt: null }),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "RECEIPT_NOT_FOUND",
      message: expect.any(String),
    });
  });

  it("rejects when the transaction is not an ArcFlow execution", async () => {
    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({
        receipt: makeReceipt({ from: OWNER_A, logs: [] }),
        flowResult: { status: "ok", flow: flowA },
      }),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "NOT_FLOW_EXECUTION",
      message: expect.any(String),
    });
  });

  it("rejects when the session wallet is not the flow owner", async () => {
    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({
        receipt: receiptA(),
        flowResult: { status: "ok", flow: defaultOnChainFlow({ owner: OWNER_B }) },
      }),
    });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.reason).toBe("FORBIDDEN");
  });

  it("propagates a failed receipt from the pure verifier", async () => {
    const outcome = await service.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({
        receipt: receiptA({ status: "reverted" }),
        flowResult: { status: "ok", flow: flowA },
      }),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "RECEIPT_FAILED",
      message: expect.any(String),
    });
  });

  it("returns CONFIGURATION_ERROR when the contract is not configured", async () => {
    delete process.env[ENV_KEY];
    vi.resetModules();
    const freshService = await import("@/lib/payments/server/service");
    const freshFactory = await import("@/lib/payments/server/factory");
    freshFactory.setTrustedRepositoryForTesting(freshFactory.createInMemoryTrustedRepository());

    const outcome = await freshService.verifyFlowExecution({
      txHash: TX_HASH_A,
      authenticatedWallet: OWNER_A,
      chain: makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "ok", flow: flowA } }),
    });

    expect(outcome).toEqual({
      status: "rejected",
      reason: "CONFIGURATION_ERROR",
      message: expect.any(String),
    });
  });

  it("fails closed when the repository throws", async () => {
    const failing = {
      ...factory.createInMemoryTrustedRepository(),
      findFlowExecutionByTxHash: async (): Promise<never> => {
        throw new Error("ledger down");
      },
    };
    factory.setTrustedRepositoryForTesting(failing);

    await expect(
      service.verifyFlowExecution({
        txHash: TX_HASH_A,
        authenticatedWallet: OWNER_A,
        chain: makeFlowChainReader({ receipt: receiptA(), flowResult: { status: "ok", flow: flowA } }),
      }),
    ).rejects.toBeInstanceOf(service.TrustedLedgerUnavailableError);
  });
});

describe("getTrustedFlowExecutions — wallet scoping", () => {
  beforeEach(async () => {
    const seeded = factory.createInMemoryTrustedRepository();
    await seeded.insertFlowExecution(
      makeFlowExecutionRecord({ id: "flx_a", txHash: TX_HASH_A, ownerWalletAddress: OWNER_A }),
    );
    await seeded.insertFlowExecution(
      makeFlowExecutionRecord({ id: "flx_b", txHash: TX_HASH_B, ownerWalletAddress: OWNER_B }),
    );
    factory.setTrustedRepositoryForTesting(seeded);
  });

  it("returns all records when no wallet is given", async () => {
    const all = await service.getTrustedFlowExecutions();
    expect(all.map((record) => record.id).sort()).toEqual(["flx_a", "flx_b"]);
  });

  it("returns [] for an anonymous (null) wallet", async () => {
    expect(await service.getTrustedFlowExecutions({ ownerWalletAddress: null })).toEqual([]);
  });

  it("filters case-insensitively by owner wallet", async () => {
    const mixedCase = OWNER_A.toUpperCase().replace("0X", "0x") as `0x${string}`;
    const forA = await service.getTrustedFlowExecutions({ ownerWalletAddress: mixedCase });
    expect(forA.map((record) => record.id)).toEqual(["flx_a"]);

    const forB = await service.getTrustedFlowExecutions({ ownerWalletAddress: OWNER_B });
    expect(forB.map((record) => record.id)).toEqual(["flx_b"]);
  });
});
