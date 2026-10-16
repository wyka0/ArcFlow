/**
 * Phase 23.59 — wallet transaction-sender core, with a MOCKED provider.
 *
 * `useTransactionSender` is a React hook, but the project's test stack has no
 * DOM environment (vitest `environment: "node"`, no jsdom/testing-library).
 * All submission logic therefore lives in `submitTransaction`, which these
 * tests exercise directly against a mocked EIP-1193 provider — the exact code
 * the hook runs. No real wallet is involved and nothing is signed or broadcast.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  toFunctionSelector,
  type Hex,
} from "viem";

import type { Eip1193Provider } from "@/lib/wallet/client";
import type { UsdcReceiptOutcome } from "@/lib/arc/payment";
import type { PreparedTransaction } from "@/lib/arcflow/interactions";
import { submitTransaction, UnknownTransactionOutcomeError } from "@/lib/arcflow/send-transaction";

const A0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const V1 = "0x3fB50a2aDc5FCba60274eDb976E12caDC6FDb8c2" as const;
const R1 = "0x1111111111111111111111111111111111111111" as const;
const R2 = "0x2222222222222222222222222222222222222222" as const;
const TX = `0x${"a".repeat(64)}` as const;
const CHAIN_HEX = "0x13b2"; // 5042
const ENV_KEY = "NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS";

interface ProviderCall {
  method: string;
  params?: unknown;
}

function makeProvider(overrides: {
  chainId?: string;
  chainIdReject?: unknown;
  accounts?: () => string[];
  accountsReject?: unknown;
  send?: () => unknown;
} = {}) {
  const sends: unknown[][] = [];
  const request = vi.fn(async (args: ProviderCall) => {
    switch (args.method) {
      case "eth_chainId":
        if (overrides.chainIdReject !== undefined) throw overrides.chainIdReject;
        return overrides.chainId ?? CHAIN_HEX;
      case "eth_accounts":
        if (overrides.accountsReject !== undefined) throw overrides.accountsReject;
        return overrides.accounts ? overrides.accounts() : [A0];
      case "eth_sendTransaction":
        sends.push(args.params as unknown[]);
        if (overrides.send) return overrides.send();
        return TX;
      default:
        throw new Error(`unexpected method ${args.method}`);
    }
  });
  return { provider: { request } as unknown as Eip1193Provider, request, sends };
}

const TX_OBJ: PreparedTransaction = {
  to: V1,
  data: "0x2d58afcd",
  value: 0n,
  chainId: 5042,
  description: "test",
};

const success: UsdcReceiptOutcome = {
  ok: true,
  transactionHash: TX,
  blockNumber: 7n,
  logs: [],
};

describe("submitTransaction — mocked EIP-1193 provider", () => {
  it("returns the confirmed receipt on success", async () => {
    const { provider, sends } = makeProvider();
    const result = await submitTransaction({
      provider,
      transaction: TX_OBJ,
      expectedAccount: A0,
      verify: async () => success,
    });
    expect(result.transactionHash).toBe(TX);
    expect(sends).toHaveLength(1);
  });

  it("sends standards-compatible params (no non-standard chainId field)", async () => {
    const { provider, sends } = makeProvider();
    await submitTransaction({
      provider,
      transaction: TX_OBJ,
      expectedAccount: A0,
      verify: async () => success,
    });
    const params = sends[0][0] as Record<string, unknown>;
    expect(params).toEqual({ from: A0, to: V1, data: "0x2d58afcd", value: "0x0" });
    expect(params).not.toHaveProperty("chainId");
  });

  it("rejects when the wallet is disconnected", async () => {
    const { provider, sends } = makeProvider();
    await expect(
      submitTransaction({ provider, transaction: TX_OBJ, expectedAccount: null, verify: async () => success }),
    ).rejects.toThrow(/not connected/i);
    expect(sends).toHaveLength(0);
  });

  it("aborts before sending on the wrong chain", async () => {
    const { provider, sends } = makeProvider({ chainId: "0x1" });
    await expect(
      submitTransaction({ provider, transaction: TX_OBJ, expectedAccount: A0, verify: async () => success }),
    ).rejects.toThrow(/no longer on chain 5042/i);
    expect(sends).toHaveLength(0);
  });

  it("aborts before sending when the account changed", async () => {
    const { provider, sends } = makeProvider({ accounts: () => [OTHER] });
    await expect(
      submitTransaction({ provider, transaction: TX_OBJ, expectedAccount: A0, verify: async () => success }),
    ).rejects.toThrow(/account changed/i);
    expect(sends).toHaveLength(0);
  });

  it("propagates a user rejection (4001) as the normalized safe message", async () => {
    const verify = vi.fn(async () => success);
    const { provider, sends } = makeProvider({
      send: () => {
        throw Object.assign(new Error("User rejected the request"), { code: 4001 });
      },
    });
    await expect(
      submitTransaction({ provider, transaction: TX_OBJ, expectedAccount: A0, verify }),
    ).rejects.toThrow("Request rejected in the wallet.");
    expect(sends).toHaveLength(1);
    expect(verify).not.toHaveBeenCalled();
  });

  it("normalizes a verbose provider error (no recognized code) to the generic safe message", async () => {
    const rawText =
      'Internal JSON-RPC error: {"code":-32603,"message":"execution reverted: 0xdeadbeef at 0x1234..."}';
    const { provider, sends } = makeProvider({
      send: () => {
        throw new Error(rawText); // no numeric/known code
      },
    });
    const error = (await submitTransaction({
      provider,
      transaction: TX_OBJ,
      expectedAccount: A0,
      verify: async () => success,
    }).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("The wallet request could not be completed.");
    expect(error.message).not.toContain("Internal JSON-RPC error");
    expect(error.message).not.toContain("0xdeadbeef");
    expect(sends).toHaveLength(1);
  });

  it("aborts and sends nothing when the chain-id read fails", async () => {
    const { provider, sends } = makeProvider({
      chainIdReject: Object.assign(new Error("provider blew up: rpc detail"), { code: 4900 }),
    });
    await expect(
      submitTransaction({ provider, transaction: TX_OBJ, expectedAccount: A0, verify: async () => success }),
    ).rejects.toThrow("The wallet request could not be completed.");
    expect(sends).toHaveLength(0);
  });

  it("aborts and sends nothing when the accounts read fails with a rejection", async () => {
    const { provider, sends } = makeProvider({
      accountsReject: Object.assign(new Error("User denied account access"), { code: 4001 }),
    });
    await expect(
      submitTransaction({ provider, transaction: TX_OBJ, expectedAccount: A0, verify: async () => success }),
    ).rejects.toThrow("Request rejected in the wallet.");
    expect(sends).toHaveLength(0);
  });

  it("treats a malformed hash as an error", async () => {
    const { provider } = makeProvider({ send: () => "not-a-hash" });
    await expect(
      submitTransaction({ provider, transaction: TX_OBJ, expectedAccount: A0, verify: async () => success }),
    ).rejects.toThrow(/invalid transaction hash/i);
  });

  it("treats a confirmed revert as an ordinary failure (not unknown)", async () => {
    const { provider } = makeProvider();
    const error = await submitTransaction({
      provider,
      transaction: TX_OBJ,
      expectedAccount: A0,
      verify: async () => ({ ok: false, reason: "TRANSACTION_REVERTED", message: "reverted on chain" }),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnknownTransactionOutcomeError);
    expect((error as Error).message).toMatch(/reverted/i);
  });

  it("treats a receipt timeout as an UNKNOWN outcome (never a failure)", async () => {
    const { provider, sends } = makeProvider();
    const error = await submitTransaction({
      provider,
      transaction: TX_OBJ,
      expectedAccount: A0,
      verify: async () => ({ ok: false, reason: "CONFIRMATION_UNKNOWN", message: "timed out waiting" }),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnknownTransactionOutcomeError);
    expect((error as Error).message).toMatch(/confirmation unknown/i);
    expect((error as Error).message).toMatch(/timed out waiting/i); // verify message preserved verbatim
    expect((error as UnknownTransactionOutcomeError).transactionHash).toBe(TX);
    // Never auto-retried.
    expect(sends).toHaveLength(1);
  });

  it("treats an RPC failure as an UNKNOWN outcome and never retries", async () => {
    const { provider, sends } = makeProvider();
    const error = await submitTransaction({
      provider,
      transaction: TX_OBJ,
      expectedAccount: A0,
      verify: async () => ({ ok: false, reason: "RPC_UNAVAILABLE", message: "node unreachable" }),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnknownTransactionOutcomeError);
    expect(sends).toHaveLength(1);
  });
});

// ============================================================
// Integration: multi-step deployFlow via submitTransaction
// ============================================================

const FLOW_CREATED = parseAbiItem(
  "event FlowCreated(uint256 indexed flowId, address indexed owner, address treasury, address contributor, uint256 threshold, uint16 treasuryBps, uint16 contributorBps)",
);

function flowCreatedLog(flowId: bigint) {
  const topics = encodeEventTopics({
    abi: [FLOW_CREATED],
    eventName: "FlowCreated",
    args: { flowId, owner: A0 },
  }) as Hex[];
  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint16" }, { type: "uint16" }],
    [R1, R2, 10n, 8000, 2000],
  );
  return { address: V1, topics, data };
}

describe("deployFlow × submitTransaction — account change between steps", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = V1;
    vi.resetModules();
  });

  it("aborts after createFlow when the account changes; no later tx is sent", async () => {
    const { provider, sends } = makeProvider({
      accounts: (() => {
        let call = 0;
        return () => (call++ === 0 ? [A0] : [OTHER]);
      })(),
    });

    let verifyCall = 0;
    const verify = async (hash: `0x${string}`): Promise<UsdcReceiptOutcome> => {
      verifyCall += 1;
      if (verifyCall === 1) {
        return { ok: true, transactionHash: hash, blockNumber: 1n, logs: [flowCreatedLog(1n)] };
      }
      return { ok: true, transactionHash: hash, blockNumber: 2n, logs: [] };
    };

    const { deployFlow } = await import("@/lib/arcflow/deploy-flow");
    const { ARC_MAINNET } = await import("@/lib/arc/network");

    await expect(
      deployFlow({
        flow: {
          condition: { operator: "GTE", amount: "10.00" },
          actions: [
            { type: "TRANSFER", recipient: R1, percentage: 80 },
            { type: "TRANSFER", recipient: R2, percentage: 20 },
          ],
        },
        network: ARC_MAINNET,
        sendTransaction: (tx: PreparedTransaction) =>
          submitTransaction({ provider, transaction: tx, expectedAccount: A0, verify }),
      }),
    ).rejects.toThrow(/account changed/i);

    // Only the createFlow transaction was submitted; activate/approve/execute were not.
    expect(sends).toHaveLength(1);
    const createSelector = toFunctionSelector("createFlow(address,address,uint256,uint16,uint16)");
    expect((sends[0][0] as { data: string }).data.slice(0, 10)).toBe(createSelector);
  });
});
