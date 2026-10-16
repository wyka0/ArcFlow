/**
 * Phase 23.58 — transaction-safety regression tests.
 *
 * Covers:
 *  - confirmed revert vs UNKNOWN receipt outcome (timeout / RPC error)
 *  - approve encodes the PASSED network's token (network consistency)
 *  - contract-address resolution validates before display
 *  - deployFlow aborts on the first failure and NEVER retries
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";

const V1 = "0x3fB50a2aDc5FCba60274eDb976E12caDC6FDb8c2" as const;
const TX = `0x${"a".repeat(64)}` as const;
const R1 = "0x1111111111111111111111111111111111111111" as const;
const R2 = "0x2222222222222222222222222222222222222222" as const;
const ENV_KEY = "NEXT_PUBLIC_ARCFLOW_CONTRACT_ADDRESS";

afterEach(() => {
  delete process.env[ENV_KEY];
  vi.resetModules();
});

function clientResolving(result: unknown): PublicClient {
  return { waitForTransactionReceipt: vi.fn().mockResolvedValue(result) } as unknown as PublicClient;
}

function clientRejecting(error: unknown): PublicClient {
  return { waitForTransactionReceipt: vi.fn().mockRejectedValue(error) } as unknown as PublicClient;
}

// ============================================================
// Receipt outcome: confirmed vs unknown
// ============================================================

describe("verifyUsdcTransaction — confirmed failure vs unknown outcome", () => {
  it("confirms a successful receipt", async () => {
    const { verifyUsdcTransaction } = await import("@/lib/arc/payment");
    const outcome = await verifyUsdcTransaction(
      clientResolving({ status: "success", transactionHash: TX, blockNumber: 1n, logs: [] }),
      TX,
    );
    expect(outcome.ok).toBe(true);
  });

  it("classifies a mined revert as TRANSACTION_REVERTED (confirmed failure)", async () => {
    const { verifyUsdcTransaction } = await import("@/lib/arc/payment");
    const outcome = await verifyUsdcTransaction(
      clientResolving({ status: "reverted", transactionHash: TX, blockNumber: 1n, logs: [] }),
      TX,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("TRANSACTION_REVERTED");
  });

  it("classifies a timeout as CONFIRMATION_UNKNOWN (never a failure)", async () => {
    const { verifyUsdcTransaction } = await import("@/lib/arc/payment");
    const timeout = Object.assign(new Error("timed out"), {
      name: "WaitForTransactionReceiptTimeoutError",
    });
    const outcome = await verifyUsdcTransaction(clientRejecting(timeout), TX);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("CONFIRMATION_UNKNOWN");
      expect(outcome.message).toMatch(/unknown/i);
      expect(outcome.message).toMatch(/do not resubmit/i);
    }
  });

  it("classifies an RPC error as RPC_UNAVAILABLE (unknown, not a failure)", async () => {
    const { verifyUsdcTransaction } = await import("@/lib/arc/payment");
    const outcome = await verifyUsdcTransaction(clientRejecting(new Error("rpc down")), TX);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("RPC_UNAVAILABLE");
      expect(outcome.message).toMatch(/unknown/i);
    }
  });

  it("passes a bounded timeout to the receipt wait", async () => {
    const { verifyUsdcTransaction } = await import("@/lib/arc/payment");
    const client = clientResolving({ status: "success", transactionHash: TX, blockNumber: 1n, logs: [] });
    await verifyUsdcTransaction(client, TX, { confirmations: 1 });
    expect(client.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ hash: TX, confirmations: 1, timeout: expect.any(Number) }),
    );
  });
});

// ============================================================
// Network consistency
// ============================================================

describe("network consistency", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = V1;
    vi.resetModules();
  });

  it("encodeApproveUsdcForArcFlow uses the PASSED network's token address", async () => {
    const { encodeApproveUsdcForArcFlow } = await import("@/lib/arcflow/interactions");
    const { ARC_MAINNET } = await import("@/lib/arc/network");
    const otherToken = "0x9999999999999999999999999999999999999999" as const;
    const network = { ...ARC_MAINNET, usdcAddress: otherToken };

    const tx = encodeApproveUsdcForArcFlow("10.00", network);
    expect(tx.to).toBe(otherToken);
  });

  it("approve spender is the configured V1 contract", async () => {
    const { encodeApproveUsdcForArcFlow } = await import("@/lib/arcflow/interactions");
    const { ARC_MAINNET } = await import("@/lib/arc/network");
    const tx = encodeApproveUsdcForArcFlow("10.00", ARC_MAINNET);
    // approve(address,uint256): selector + 32-byte spender word.
    const spenderWord = tx.data.slice(10, 74);
    expect(spenderWord.toLowerCase()).toBe("0".repeat(24) + V1.slice(2).toLowerCase());
  });

  it("resolveArcFlowContractAddress returns the configured address", async () => {
    const { resolveArcFlowContractAddress } = await import("@/lib/arcflow/contract");
    const { ARC_MAINNET } = await import("@/lib/arc/network");
    expect(resolveArcFlowContractAddress(ARC_MAINNET)?.toLowerCase()).toBe(V1.toLowerCase());
  });
});

describe("resolveArcFlowContractAddress — unset", () => {
  it("returns null when no address is configured (never a placeholder)", async () => {
    delete process.env[ENV_KEY];
    vi.resetModules();
    const { resolveArcFlowContractAddress } = await import("@/lib/arcflow/contract");
    const { ARC_MAINNET } = await import("@/lib/arc/network");
    expect(resolveArcFlowContractAddress(ARC_MAINNET)).toBeNull();
  });
});

// ============================================================
// deployFlow aborts and never retries
// ============================================================

describe("deployFlow — aborts on failure and never retries", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = V1;
    vi.resetModules();
  });

  async function deployWith(send: () => Promise<never>) {
    const { deployFlow } = await import("@/lib/arcflow/deploy-flow");
    const { ARC_MAINNET } = await import("@/lib/arc/network");
    return deployFlow({
      flow: {
        condition: { operator: "GTE", amount: "10.00" },
        actions: [
          { type: "TRANSFER", recipient: R1, percentage: 80 },
          { type: "TRANSFER", recipient: R2, percentage: 20 },
        ],
      },
      network: ARC_MAINNET,
      sendTransaction: send,
    });
  }

  it("stops after a confirmed revert with exactly one submission", async () => {
    let calls = 0;
    const send = async () => {
      calls += 1;
      throw new Error("The Arc transaction was mined but reverted. No payment was recorded.");
    };
    await expect(deployWith(send)).rejects.toThrow(/reverted/i);
    expect(calls).toBe(1);
  });

  it("stops after an UNKNOWN outcome with exactly one submission (no blind resubmit)", async () => {
    let calls = 0;
    const send = async () => {
      calls += 1;
      throw new Error("Confirmation unknown — Timed out waiting for the Arc transaction receipt.");
    };
    await expect(deployWith(send)).rejects.toThrow(/confirmation unknown/i);
    expect(calls).toBe(1);
  });

  it("stops after a user rejection with exactly one submission", async () => {
    let calls = 0;
    const send = async () => {
      calls += 1;
      throw new Error("User rejected transaction");
    };
    await expect(deployWith(send)).rejects.toThrow(/rejected/i);
    expect(calls).toBe(1);
  });
});
