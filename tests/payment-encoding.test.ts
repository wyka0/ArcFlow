import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { ARC_MAINNET } from "@/lib/arc/network";
import {
  classifyReceipt,
  encodeUsdcTransfer,
  prepareUsdcPayment,
  toUsdcBaseUnits,
} from "@/lib/arc/payment";
import { USDC_ABI } from "@/lib/arc/usdc";
import type { PaymentRequest } from "@/types";

const RECIPIENT = "0x1234567890abcdef1234567890abcdef12345678" as const;

describe("toUsdcBaseUnits", () => {
  it("converts USDC to 6-decimal base units exactly", () => {
    expect(toUsdcBaseUnits(0.1)).toBe(100_000n);
    expect(toUsdcBaseUnits(0.25)).toBe(250_000n);
    expect(toUsdcBaseUnits(1)).toBe(1_000_000n);
    expect(toUsdcBaseUnits(5)).toBe(5_000_000n);
  });

  it("is not affected by floating point drift", () => {
    expect(toUsdcBaseUnits(0.1 + 0.2)).toBe(300_000n);
  });

  it("rejects non-positive or non-finite amounts", () => {
    expect(() => toUsdcBaseUnits(0)).toThrow();
    expect(() => toUsdcBaseUnits(-1)).toThrow();
    expect(() => toUsdcBaseUnits(Number.NaN)).toThrow();
    expect(() => toUsdcBaseUnits(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("encodeUsdcTransfer", () => {
  it("targets the configured Arc USDC contract", () => {
    const encoded = encodeUsdcTransfer({ recipient: RECIPIENT, amount: 0.1, network: ARC_MAINNET });
    expect(encoded.token).toBe("0x3600000000000000000000000000000000000000");
    expect(encoded.value).toBe(0n);
  });

  it("encodes an ERC-20 transfer(address,uint256) call", () => {
    const encoded = encodeUsdcTransfer({ recipient: RECIPIENT, amount: 0.1, network: ARC_MAINNET });
    expect(encoded.data.slice(0, 10)).toBe("0xa9059cbb");

    const decoded = decodeFunctionData({ abi: USDC_ABI, data: encoded.data });
    expect(decoded.functionName).toBe("transfer");
    expect(String(decoded.args?.[0]).toLowerCase()).toBe(RECIPIENT);
    expect(decoded.args?.[1]).toBe(100_000n);
  });
});

describe("prepareUsdcPayment", () => {
  const request: PaymentRequest = {
    id: "pay_test",
    agentId: "agent_research_01",
    serviceId: "market-data",
    recipient: RECIPIENT,
    amount: { amount: 0.25, currency: "USDC" },
    currency: "USDC",
  };

  it("produces an unsigned call with no value attached", () => {
    const prepared = prepareUsdcPayment(request, ARC_MAINNET);
    expect(prepared.to).toBe(ARC_MAINNET.usdcAddress);
    expect(prepared.chainId).toBe(5042);
    expect(prepared.amountBaseUnits).toBe(250_000n);
    expect(prepared.value).toBe(0n);
  });

  it("rejects a non-USDC request", () => {
    expect(() =>
      prepareUsdcPayment({ ...request, currency: "EURC" as PaymentRequest["currency"] }, ARC_MAINNET),
    ).toThrow();
  });
});

describe("classifyReceipt", () => {
  it("confirms only a successful receipt", () => {
    const result = classifyReceipt({
      transactionHash: `0x${"a".repeat(64)}`,
      status: "success",
      blockNumber: 10n,
    });
    expect(result.ok).toBe(true);
  });

  it("never confirms a reverted receipt", () => {
    const result = classifyReceipt({
      transactionHash: `0x${"a".repeat(64)}`,
      status: "reverted",
      blockNumber: 10n,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("TRANSACTION_REVERTED");
  });
});
