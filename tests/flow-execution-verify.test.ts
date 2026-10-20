import { describe, expect, it } from "vitest";

import { ARC_MAINNET } from "@/lib/arc/network";
import {
  verifyFlowExecutionReceipt,
  type FlowExecutionFailureReason,
  type FlowExecutionVerificationResult,
} from "@/lib/payments/server/flow-execution-verify";
import type { MinimalReceipt, ReceiptLog } from "@/lib/payments/server/verify";

import {
  CONTRIBUTOR,
  OTHER,
  OWNER,
  TEST_CONTRACT,
  TX_HASH_A,
  TX_HASH_B,
  defaultSplit,
  flowExecutedLog,
  makeReceipt,
  splitLogs,
  transferLog,
  uppercaseHash,
  type SplitFixture,
} from "./flow-execution-fixtures";

/**
 * Pure verifier tests — no network access, no chain, no wallet. Every rule in
 * `flow-execution-verify.ts` is a deterministic unit test here.
 */

function verify(input: {
  receipt: MinimalReceipt | null;
  fixture?: SplitFixture;
  contractAddress?: string;
  observedChainId?: number | null;
  transactionHash?: string;
}): FlowExecutionVerificationResult {
  const fixture = input.fixture ?? defaultSplit();
  return verifyFlowExecutionReceipt({
    transactionHash: input.transactionHash ?? TX_HASH_A,
    network: ARC_MAINNET,
    contractAddress: input.contractAddress ?? TEST_CONTRACT,
    expected: {
      flowId: fixture.flowId,
      owner: fixture.owner,
      treasury: fixture.treasury,
      contributor: fixture.contributor,
      treasuryBps: fixture.treasuryBps,
      contributorBps: fixture.contributorBps,
    },
    receipt: input.receipt,
    observedChainId: input.observedChainId,
  });
}

function expectFailed(
  result: FlowExecutionVerificationResult,
  reason: FlowExecutionFailureReason,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toBe(reason);
  }
}

describe("verifyFlowExecutionReceipt (pure)", () => {
  const fixture = defaultSplit();

  it("accepts a valid split and all three expected USDC transfers", () => {
    const result = verify({ receipt: makeReceipt({ logs: splitLogs(fixture) }) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chainId).toBe(ARC_MAINNET.chainId);
    expect(result.blockNumber).toBe(123_456n);
    expect(result.flowId).toBe(1n);
    expect(result.owner.toLowerCase()).toBe(OWNER.toLowerCase());
    expect(result.amountBaseUnits).toBe(10_000n);
    expect(result.treasuryAmountBaseUnits).toBe(8_000n);
    expect(result.contributorAmountBaseUnits).toBe(2_000n);
    expect(result.transactionHash).toBe(TX_HASH_A);
  });

  it("rejects a malformed hash before anything else", () => {
    expectFailed(
      verify({ receipt: makeReceipt({ logs: splitLogs(fixture) }), transactionHash: "0x1234" }),
      "MALFORMED_HASH",
    );
  });

  it("rejects a wrong chain (observed chain id when the receipt has none)", () => {
    const receipt = makeReceipt({ chainId: undefined, logs: splitLogs(fixture) });
    expectFailed(verify({ receipt, observedChainId: 999 }), "WRONG_CHAIN");
  });

  it("rejects a receipt whose chain id belongs to another network", () => {
    const receipt = makeReceipt({ chainId: 5_042_002, logs: splitLogs(fixture) });
    expectFailed(verify({ receipt }), "WRONG_CHAIN");
  });

  it("rejects a missing receipt", () => {
    expectFailed(verify({ receipt: null, observedChainId: ARC_MAINNET.chainId }), "RECEIPT_NOT_FOUND");
  });

  it("rejects a reverted receipt", () => {
    const receipt = makeReceipt({ status: "reverted", logs: splitLogs(fixture) });
    expectFailed(verify({ receipt }), "RECEIPT_FAILED");
  });

  it("rejects a receipt that belongs to a different transaction", () => {
    const receipt = makeReceipt({ transactionHash: TX_HASH_B, logs: splitLogs(fixture) });
    expectFailed(verify({ receipt }), "RECEIPT_HASH_MISMATCH");
  });

  it("binds the receipt hash case-insensitively (mixed-case receipt, lowercase request)", () => {
    const receipt = makeReceipt({
      transactionHash: uppercaseHash(TX_HASH_A),
      logs: splitLogs(fixture),
    });

    const result = verify({ receipt });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactionHash).toBe(TX_HASH_A);
  });

  it("returns the canonical lowercase hash for a mixed-case request", () => {
    const receipt = makeReceipt({ logs: splitLogs(fixture) });
    const result = verify({ receipt, transactionHash: uppercaseHash(TX_HASH_A) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactionHash).toBe(TX_HASH_A);
  });

  it("rejects a transaction sent to another contract", () => {
    const receipt = makeReceipt({ to: OTHER, logs: splitLogs(fixture) });
    expectFailed(verify({ receipt }), "WRONG_CONTRACT");
  });

  it("rejects a receipt without a target address", () => {
    const receipt = makeReceipt({ to: null, logs: splitLogs(fixture) });
    expectFailed(verify({ receipt }), "WRONG_CONTRACT");
  });

  it("rejects a receipt without a sender", () => {
    const receipt = makeReceipt({ from: undefined, logs: splitLogs(fixture) });
    expectFailed(verify({ receipt }), "OWNER_MISMATCH");
  });

  it("rejects a transaction with no FlowExecuted event", () => {
    const receipt = makeReceipt({ logs: splitLogs(fixture, { includeEvent: false }) });
    expectFailed(verify({ receipt }), "NOT_FLOW_EXECUTION");
  });

  it("rejects duplicated FlowExecuted events", () => {
    const logs = splitLogs(fixture);
    logs.push(
      flowExecutedLog(
        TEST_CONTRACT,
        fixture.flowId,
        fixture.owner,
        fixture.amountBaseUnits,
        fixture.treasuryAmountBaseUnits,
        fixture.contributorAmountBaseUnits,
      ),
    );
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "NOT_FLOW_EXECUTION");
  });

  it("rejects a FlowExecuted event emitted by another contract", () => {
    const logs: ReceiptLog[] = [
      transferLog(fixture.owner, TEST_CONTRACT, fixture.amountBaseUnits),
      transferLog(TEST_CONTRACT, fixture.treasury, fixture.treasuryAmountBaseUnits),
      transferLog(TEST_CONTRACT, fixture.contributor, fixture.contributorAmountBaseUnits),
      flowExecutedLog(
        OTHER,
        fixture.flowId,
        fixture.owner,
        fixture.amountBaseUnits,
        fixture.treasuryAmountBaseUnits,
        fixture.contributorAmountBaseUnits,
      ),
    ];
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "NOT_FLOW_EXECUTION");
  });

  it("rejects a different flow id", () => {
    const other = defaultSplit({ flowId: 2n });
    expectFailed(verify({ receipt: makeReceipt({ logs: splitLogs(other) }) }), "FLOW_MISMATCH");
  });

  it("rejects an event owner that differs from the on-chain owner", () => {
    const other = defaultSplit({ owner: OTHER });
    expectFailed(verify({ receipt: makeReceipt({ logs: splitLogs(other) }) }), "OWNER_MISMATCH");
  });

  it("rejects a transaction not sent by the flow owner", () => {
    const receipt = makeReceipt({ from: OTHER, logs: splitLogs(fixture) });
    expectFailed(verify({ receipt }), "OWNER_MISMATCH");
  });

  it("rejects split arithmetic that does not match the basis points", () => {
    const bad = defaultSplit({ treasuryAmountBaseUnits: 7_000n, contributorAmountBaseUnits: 3_000n });
    expectFailed(verify({ receipt: makeReceipt({ logs: splitLogs(bad) }) }), "SPLIT_MISMATCH");
  });

  it("rejects a missing treasury transfer", () => {
    const logs = splitLogs(fixture, { includeTreasury: false });
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("rejects a missing contributor transfer", () => {
    const logs = splitLogs(fixture, { includeContributor: false });
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("rejects a missing pull transfer", () => {
    const logs = splitLogs(fixture, { includePull: false });
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("rejects a wrong treasury transfer amount", () => {
    const logs: ReceiptLog[] = [
      transferLog(fixture.owner, TEST_CONTRACT, fixture.amountBaseUnits),
      transferLog(TEST_CONTRACT, fixture.treasury, 7_000n),
      transferLog(TEST_CONTRACT, fixture.contributor, fixture.contributorAmountBaseUnits),
      flowExecutedLog(
        TEST_CONTRACT,
        fixture.flowId,
        fixture.owner,
        fixture.amountBaseUnits,
        fixture.treasuryAmountBaseUnits,
        fixture.contributorAmountBaseUnits,
      ),
    ];
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("rejects a wrong treasury recipient", () => {
    const logs: ReceiptLog[] = [
      transferLog(fixture.owner, TEST_CONTRACT, fixture.amountBaseUnits),
      transferLog(TEST_CONTRACT, OTHER, fixture.treasuryAmountBaseUnits),
      transferLog(TEST_CONTRACT, fixture.contributor, fixture.contributorAmountBaseUnits),
      flowExecutedLog(
        TEST_CONTRACT,
        fixture.flowId,
        fixture.owner,
        fixture.amountBaseUnits,
        fixture.treasuryAmountBaseUnits,
        fixture.contributorAmountBaseUnits,
      ),
    ];
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("rejects a pull from the wrong sender", () => {
    const logs: ReceiptLog[] = [
      transferLog(OTHER, TEST_CONTRACT, fixture.amountBaseUnits),
      transferLog(TEST_CONTRACT, fixture.treasury, fixture.treasuryAmountBaseUnits),
      transferLog(TEST_CONTRACT, fixture.contributor, fixture.contributorAmountBaseUnits),
      flowExecutedLog(
        TEST_CONTRACT,
        fixture.flowId,
        fixture.owner,
        fixture.amountBaseUnits,
        fixture.treasuryAmountBaseUnits,
        fixture.contributorAmountBaseUnits,
      ),
    ];
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("rejects extra USDC transfers", () => {
    const logs = splitLogs(fixture);
    logs.push(transferLog(OTHER, CONTRIBUTOR, 1n));
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("rejects a duplicated pull transfer", () => {
    const logs = splitLogs(fixture);
    logs.push(transferLog(fixture.owner, TEST_CONTRACT, fixture.amountBaseUnits));
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("ignores transfers from another token contract", () => {
    const logs: ReceiptLog[] = [
      transferLog(fixture.owner, TEST_CONTRACT, fixture.amountBaseUnits),
      transferLog(TEST_CONTRACT, fixture.contributor, fixture.contributorAmountBaseUnits),
      // Treasury leg emitted by an unrelated token → not a USDC transfer.
      transferLog(TEST_CONTRACT, fixture.treasury, fixture.treasuryAmountBaseUnits, OTHER),
      flowExecutedLog(
        TEST_CONTRACT,
        fixture.flowId,
        fixture.owner,
        fixture.amountBaseUnits,
        fixture.treasuryAmountBaseUnits,
        fixture.contributorAmountBaseUnits,
      ),
    ];
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("accepts the zero-treasury-bps edge (contributor receives all, treasury leg skipped)", () => {
    const zeroTreasury = defaultSplit({
      treasuryBps: 0,
      contributorBps: 10_000,
      treasuryAmountBaseUnits: 0n,
      contributorAmountBaseUnits: 10_000n,
    });
    const result = verify({
      receipt: makeReceipt({ logs: splitLogs(zeroTreasury) }),
      fixture: zeroTreasury,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.treasuryAmountBaseUnits).toBe(0n);
    expect(result.contributorAmountBaseUnits).toBe(10_000n);
  });

  it("accepts the zero-contributor-bps edge (treasury receives all, contributor leg skipped)", () => {
    const zeroContributor = defaultSplit({
      treasuryBps: 10_000,
      contributorBps: 0,
      treasuryAmountBaseUnits: 10_000n,
      contributorAmountBaseUnits: 0n,
    });
    const result = verify({
      receipt: makeReceipt({ logs: splitLogs(zeroContributor) }),
      fixture: zeroContributor,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.treasuryAmountBaseUnits).toBe(10_000n);
    expect(result.contributorAmountBaseUnits).toBe(0n);
  });

  it("rejects a zero-value leg the contract would not emit", () => {
    const zeroTreasury = defaultSplit({
      treasuryBps: 0,
      contributorBps: 10_000,
      treasuryAmountBaseUnits: 0n,
      contributorAmountBaseUnits: 10_000n,
    });
    const logs: ReceiptLog[] = [
      transferLog(zeroTreasury.owner, TEST_CONTRACT, zeroTreasury.amountBaseUnits),
      // A zero-value treasury transfer is not part of a real executeSplit.
      transferLog(TEST_CONTRACT, zeroTreasury.treasury, 0n),
      transferLog(TEST_CONTRACT, zeroTreasury.contributor, zeroTreasury.contributorAmountBaseUnits),
      flowExecutedLog(
        TEST_CONTRACT,
        zeroTreasury.flowId,
        zeroTreasury.owner,
        zeroTreasury.amountBaseUnits,
        zeroTreasury.treasuryAmountBaseUnits,
        zeroTreasury.contributorAmountBaseUnits,
      ),
    ];
    expectFailed(
      verify({ receipt: makeReceipt({ logs }), fixture: zeroTreasury }),
      "TRANSFER_MISMATCH",
    );
  });

  it("rejects a receipt with the event but no USDC transfers", () => {
    const logs = splitLogs(fixture, {
      includePull: false,
      includeTreasury: false,
      includeContributor: false,
    });
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });

  it("accepts case-insensitive address matching", () => {
    // A real EIP-55 checksummed address compared against its lowercase form:
    // decoded log addresses and expected values may differ in case.
    const checksummed = "0x3fB50a2aDc5FCba60274eDb976E12caDC6FDb8c2" as const;
    const lowercaseOwner = checksummed.toLowerCase() as typeof OWNER;
    const mixed = defaultSplit({ owner: checksummed });

    const result = verifyFlowExecutionReceipt({
      transactionHash: TX_HASH_A,
      network: ARC_MAINNET,
      contractAddress: TEST_CONTRACT,
      expected: {
        flowId: mixed.flowId,
        owner: lowercaseOwner,
        treasury: mixed.treasury,
        contributor: mixed.contributor,
        treasuryBps: mixed.treasuryBps,
        contributorBps: mixed.contributorBps,
      },
      receipt: makeReceipt({ from: lowercaseOwner, logs: splitLogs(mixed) }),
    });

    expect(result.ok).toBe(true);
  });

  it("verifies against the configured USDC contract, not a lookalike token", () => {
    const fakeToken = "0x1111111111111111111111111111111111111111";
    const logs: ReceiptLog[] = [
      transferLog(fixture.owner, TEST_CONTRACT, fixture.amountBaseUnits, fakeToken),
      transferLog(TEST_CONTRACT, fixture.treasury, fixture.treasuryAmountBaseUnits, fakeToken),
      transferLog(TEST_CONTRACT, fixture.contributor, fixture.contributorAmountBaseUnits, fakeToken),
      flowExecutedLog(
        TEST_CONTRACT,
        fixture.flowId,
        fixture.owner,
        fixture.amountBaseUnits,
        fixture.treasuryAmountBaseUnits,
        fixture.contributorAmountBaseUnits,
      ),
    ];
    expectFailed(verify({ receipt: makeReceipt({ logs }) }), "TRANSFER_MISMATCH");
  });
});
