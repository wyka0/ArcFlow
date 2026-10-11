import { decodeFunctionData } from "viem";
import { describe, expect, it, vi } from "vitest";

import { ARC_MAINNET } from "@/lib/arc/network";
import { USDC_ABI } from "@/lib/arc/usdc";
import type { Eip1193Provider } from "@/lib/wallet/client";
import { sendUsdcTransfer } from "@/lib/wallet/payment";
import type { PaymentRequest } from "@/types";

const FROM = "0x9999567890abcdef1234567890abcdef12345678" as const;
const RECIPIENT = "0x1234567890abcdef1234567890abcdef12345678" as const;
const HASH = `0x${"c".repeat(64)}` as const;

const REQUEST: PaymentRequest = {
  id: "pay_test",
  agentId: "agent_research_01",
  serviceId: "market-data",
  recipient: RECIPIENT,
  amount: { amount: 0.1, currency: "USDC" },
  currency: "USDC",
};

interface CapturedTx {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
}

function mockProvider(handler: (params: unknown) => unknown): {
  provider: Eip1193Provider;
  calls: Array<{ method: string; params?: unknown }>;
  captured: CapturedTx[];
} {
  const calls: Array<{ method: string; params?: unknown }> = [];
  const captured: CapturedTx[] = [];

  const provider: Eip1193Provider = {
    async request(args) {
      calls.push({ method: args.method, params: args.params });
      if (args.method === "eth_sendTransaction") {
        const tx = (args.params as CapturedTx[])[0];
        if (tx) captured.push(tx);
      }
      return handler(args.params);
    },
  };

  return { provider, calls, captured };
}

describe("sendUsdcTransfer", () => {
  it("submits an ERC-20 transfer to the Arc USDC contract and returns the hash", async () => {
    const { provider, captured } = mockProvider(() => HASH);

    const result = await sendUsdcTransfer({
      provider,
      network: ARC_MAINNET,
      request: REQUEST,
      from: FROM,
    });

    expect(result).toEqual({ ok: true, transactionHash: HASH });

    const tx = captured[0];
    expect(tx?.to).toBe(ARC_MAINNET.usdcAddress);
    expect(tx?.from).toBe(FROM);
    expect(tx?.value).toBe("0x0");
    expect(tx?.data?.slice(0, 10)).toBe("0xa9059cbb");

    const decoded = decodeFunctionData({ abi: USDC_ABI, data: tx?.data as `0x${string}` });
    expect(String(decoded.args?.[0]).toLowerCase()).toBe(RECIPIENT);
    expect(decoded.args?.[1]).toBe(100_000n);
  });

  it("treats a wallet rejection as a failure and does not return a hash", async () => {
    const { provider, captured } = mockProvider(() => {
      throw { code: 4001 };
    });

    const result = await sendUsdcTransfer({
      provider,
      network: ARC_MAINNET,
      request: REQUEST,
      from: FROM,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("USER_REJECTED");
    // The wallet was asked, but no hash was produced.
    expect(captured).toHaveLength(1);
  });

  it("maps insufficient funds", async () => {
    const { provider } = mockProvider(() => {
      throw { code: -32000, message: "insufficient funds for gas * price + value" };
    });
    const result = await sendUsdcTransfer({ provider, network: ARC_MAINNET, request: REQUEST, from: FROM });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("rejects a malformed wallet response without marking anything sent", async () => {
    const { provider } = mockProvider(() => "not-a-hash");
    const result = await sendUsdcTransfer({ provider, network: ARC_MAINNET, request: REQUEST, from: FROM });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_HASH");
  });

  it("never contacts the wallet for a malformed request", async () => {
    const { provider, calls } = mockProvider(() => HASH);

    const result = await sendUsdcTransfer({
      provider,
      network: ARC_MAINNET,
      request: { ...REQUEST, recipient: "0xnot-an-address" as PaymentRequest["recipient"] },
      from: FROM,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MALFORMED_REQUEST");
    expect(calls).toHaveLength(0);
  });

  it("never contacts the wallet for a non-positive amount", async () => {
    const { provider, calls } = mockProvider(() => HASH);
    const result = await sendUsdcTransfer({
      provider,
      network: ARC_MAINNET,
      request: { ...REQUEST, amount: { amount: 0, currency: "USDC" } },
      from: FROM,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MALFORMED_REQUEST");
    expect(calls).toHaveLength(0);
  });

  it("does not swallow an unexpected provider failure", async () => {
    const { provider } = mockProvider(() => {
      throw new Error("boom");
    });
    const result = await sendUsdcTransfer({ provider, network: ARC_MAINNET, request: REQUEST, from: FROM });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUBMISSION_FAILED");
  });

  it("never exposes a generic sendTransaction helper", async () => {
    const paymentModule = await import("@/lib/wallet/payment");
    expect(Object.keys(paymentModule)).not.toContain("sendTransaction");
    expect(vi.isMockFunction(paymentModule.sendUsdcTransfer)).toBe(false);
  });
});
