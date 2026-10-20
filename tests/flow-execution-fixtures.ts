import { encodeAbiParameters, encodeEventTopics } from "viem";

import { ARC_MAINNET } from "@/lib/arc/network";
import { ARC_ABI_PAYMENT_RECEIPT } from "@/lib/arc/usdc";
import { ARCFLOW_ABI } from "@/lib/arcflow/contract";
import type {
  ArcFlowChainReader,
  OnChainFlow,
  ReadOnChainFlowResult,
} from "@/lib/payments/server/chain";
import type { MinimalReceipt, ReceiptLog } from "@/lib/payments/server/verify";
import type { EvmAddress, FlowExecutionRecord, TransactionHash } from "@/types";

/**
 * Shared fixtures for flow-execution verification tests.
 *
 * All addresses and hashes are synthetic; no test touches a real wallet, chain,
 * or database. Logs are encoded with viem so the fixtures exercise the same
 * decoding path as real mainnet receipts.
 *
 * This file is intentionally not named `*.test.ts` — it is a helper, not a
 * test suite.
 */

export const TEST_CHAIN_ID = ARC_MAINNET.chainId;
export const TEST_USDC = ARC_MAINNET.usdcAddress as EvmAddress;
export const TEST_CONTRACT = "0xdddddddddddddddddddddddddddddddddddddddd" as EvmAddress;
export const OWNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as EvmAddress;
export const TREASURY = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as EvmAddress;
export const CONTRIBUTOR = "0xcccccccccccccccccccccccccccccccccccccccc" as EvmAddress;
export const OTHER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as EvmAddress;

export const TX_HASH_A = `0x${"a".repeat(64)}` as TransactionHash;
export const TX_HASH_B = `0x${"b".repeat(64)}` as TransactionHash;

/** The same hash with upper-cased hex digits — for case-variant tests. */
export function uppercaseHash(hash: TransactionHash): TransactionHash {
  return `0x${hash.slice(2).toUpperCase()}` as TransactionHash;
}

export interface SplitFixture {
  flowId: bigint;
  owner: EvmAddress;
  treasury: EvmAddress;
  contributor: EvmAddress;
  amountBaseUnits: bigint;
  treasuryBps: number;
  contributorBps: number;
  treasuryAmountBaseUnits: bigint;
  contributorAmountBaseUnits: bigint;
}

/** The canonical 80/20 split of 0.01 USDC used across the tests. */
export function defaultSplit(overrides: Partial<SplitFixture> = {}): SplitFixture {
  const base: SplitFixture = {
    flowId: 1n,
    owner: OWNER,
    treasury: TREASURY,
    contributor: CONTRIBUTOR,
    amountBaseUnits: 10_000n,
    treasuryBps: 8000,
    contributorBps: 2000,
    treasuryAmountBaseUnits: 8_000n,
    contributorAmountBaseUnits: 2_000n,
  };
  return { ...base, ...overrides };
}

/** A synthetic `FlowExecuted` log, encoded exactly like the contract emits it. */
export function flowExecutedLog(
  contract: string,
  flowId: bigint,
  owner: string,
  amountBaseUnits: bigint,
  treasuryAmountBaseUnits: bigint,
  contributorAmountBaseUnits: bigint,
): ReceiptLog {
  const topics = encodeEventTopics({
    abi: ARCFLOW_ABI,
    eventName: "FlowExecuted",
    args: { flowId, owner: owner as `0x${string}` },
  });
  return {
    address: contract,
    topics: topics as readonly string[],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [amountBaseUnits, treasuryAmountBaseUnits, contributorAmountBaseUnits],
    ),
  };
}

/** A synthetic USDC `Transfer` log. */
export function transferLog(
  from: string,
  to: string,
  value: bigint,
  token: string = TEST_USDC,
): ReceiptLog {
  const topics = encodeEventTopics({
    abi: ARC_ABI_PAYMENT_RECEIPT,
    eventName: "Transfer",
    args: { from: from as `0x${string}`, to: to as `0x${string}` },
  });
  return {
    address: token,
    topics: topics as readonly string[],
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
  };
}

export interface SplitLogOptions {
  contract?: string;
  includeEvent?: boolean;
  includePull?: boolean;
  includeTreasury?: boolean;
  includeContributor?: boolean;
}

/**
 * The exact log set a successful V1 `executeSplit` emits for a fixture:
 * owner→contract pull, then one distribution leg per non-zero amount, then the
 * `FlowExecuted` event.
 */
export function splitLogs(
  fixture: SplitFixture = defaultSplit(),
  options: SplitLogOptions = {},
): ReceiptLog[] {
  const contract = options.contract ?? TEST_CONTRACT;
  const logs: ReceiptLog[] = [];

  if (options.includePull !== false) {
    logs.push(transferLog(fixture.owner, contract, fixture.amountBaseUnits));
  }
  if (options.includeTreasury !== false && fixture.treasuryAmountBaseUnits > 0n) {
    logs.push(transferLog(contract, fixture.treasury, fixture.treasuryAmountBaseUnits));
  }
  if (options.includeContributor !== false && fixture.contributorAmountBaseUnits > 0n) {
    logs.push(transferLog(contract, fixture.contributor, fixture.contributorAmountBaseUnits));
  }
  if (options.includeEvent !== false) {
    logs.push(
      flowExecutedLog(
        contract,
        fixture.flowId,
        fixture.owner,
        fixture.amountBaseUnits,
        fixture.treasuryAmountBaseUnits,
        fixture.contributorAmountBaseUnits,
      ),
    );
  }

  return logs;
}

export function makeReceipt(overrides: Partial<MinimalReceipt> = {}): MinimalReceipt {
  return {
    status: "success",
    transactionHash: TX_HASH_A,
    blockNumber: 123_456n,
    from: OWNER,
    to: TEST_CONTRACT,
    chainId: TEST_CHAIN_ID,
    logs: [],
    ...overrides,
  };
}

export function defaultOnChainFlow(overrides: Partial<OnChainFlow> = {}): OnChainFlow {
  return {
    owner: OWNER,
    treasury: TREASURY,
    contributor: CONTRIBUTOR,
    treasuryBps: 8000,
    contributorBps: 2000,
    threshold: 10_000n,
    active: true,
    ...overrides,
  };
}

export interface FakeReaderOptions {
  chainId?: number | null;
  receipt?: MinimalReceipt | null;
  flowResult?: ReadOnChainFlowResult;
  onReadFlow?: (flowId: bigint) => void;
}

/** Injected fake chain reader — no network access. */
export function makeFlowChainReader(options: FakeReaderOptions = {}): ArcFlowChainReader {
  const { chainId = TEST_CHAIN_ID, receipt = null } = options;
  return {
    getChainId: async () => chainId,
    getTransactionReceipt: async () => receipt,
    readFlow: async (flowId) => {
      options.onReadFlow?.(flowId);
      return options.flowResult ?? { status: "not_found" };
    },
  };
}

export function makeFlowExecutionRecord(
  overrides: Partial<FlowExecutionRecord> = {},
): FlowExecutionRecord {
  const now = new Date().toISOString();
  return {
    kind: "flow_execution",
    id: "flx_1",
    txHash: TX_HASH_A,
    chainId: TEST_CHAIN_ID,
    contractAddress: TEST_CONTRACT,
    flowId: "1",
    ownerWalletAddress: OWNER,
    sender: OWNER,
    tokenAddress: TEST_USDC,
    treasury: TREASURY,
    treasuryAmount: { amount: 0.008, currency: "USDC" },
    treasuryAmountBaseUnits: "8000",
    contributor: CONTRIBUTOR,
    contributorAmount: { amount: 0.002, currency: "USDC" },
    contributorAmountBaseUnits: "2000",
    totalAmount: { amount: 0.01, currency: "USDC" },
    totalAmountBaseUnits: "10000",
    status: "confirmed",
    blockNumber: "123456",
    confirmedAt: now,
    createdAt: now,
    ...overrides,
  };
}
