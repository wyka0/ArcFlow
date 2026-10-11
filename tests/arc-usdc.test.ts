import { describe, expect, it } from "vitest";

import { ARC_MAINNET, ARC_TESTNET, getArcRpcUrl } from "@/lib/arc/network";
import {
  classifyUsdcError,
  formatUsdcDisplay,
  settleUsdcRead,
} from "@/lib/arc/usdc";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as const;

describe("Arc network configuration", () => {
  it("uses the documented mainnet values", () => {
    expect(ARC_MAINNET.chainId).toBe(5042);
    expect(ARC_MAINNET.rpcUrl).toBe("https://rpc.mainnet.arc.io");
    expect(ARC_MAINNET.explorerUrl).toBe("https://explorer.arc.io");
    expect(ARC_MAINNET.usdcAddress).toBe("0x3600000000000000000000000000000000000000");
    expect(ARC_MAINNET.usdcDecimals).toBe(6);
    expect(ARC_MAINNET.nativeUsdcDecimals).toBe(18);
  });

  it("uses the documented testnet values", () => {
    expect(ARC_TESTNET.chainId).toBe(5042002);
    expect(ARC_TESTNET.rpcUrl).toBe("https://rpc.testnet.arc.io");
    expect(ARC_TESTNET.usdcAddress).toBe(ARC_MAINNET.usdcAddress);
  });

  it("builds the chain id as hex for wallet requests", () => {
    expect(`0x${ARC_MAINNET.chainId.toString(16)}`).toBe("0x13b2");
    expect(`0x${ARC_TESTNET.chainId.toString(16)}`).toBe("0x4cef52");
  });

  it("falls back to the documented RPC when no override is set", () => {
    delete process.env.NEXT_PUBLIC_ARC_RPC_URL;
    expect(getArcRpcUrl(ARC_MAINNET)).toBe("https://rpc.mainnet.arc.io");
  });
});

describe("formatUsdcDisplay", () => {
  it("formats zero", () => {
    expect(formatUsdcDisplay(0n, 6)).toBe("0.00");
  });

  it("formats a typical balance", () => {
    expect(formatUsdcDisplay(1_500_000n, 6)).toBe("1.50");
  });

  it("groups thousands and trims trailing zeros", () => {
    expect(formatUsdcDisplay(1_234_567_890n, 6)).toBe("1,234.56789");
  });

  it("keeps at least two decimals", () => {
    expect(formatUsdcDisplay(1_000_000n, 6)).toBe("1.00");
    expect(formatUsdcDisplay(50_000n, 6)).toBe("0.05");
  });
});

describe("settleUsdcRead (no fake balance fallback)", () => {
  it("returns a real zero balance only when the chain reported zero", () => {
    const result = settleUsdcRead({ ok: true, baseUnits: 0n, blockNumber: 42n }, {
      address: ADDRESS,
      decimals: 6,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amount).toBe(0n);
      expect(result.value.formatted).toBe("0.00");
      expect(result.value.blockNumber).toBe(42n);
    }
  });

  it("never converts a failed read into a zero balance", () => {
    const result = settleUsdcRead({ ok: false, error: new Error("boom") }, {
      address: ADDRESS,
      decimals: 6,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).not.toContain("boom");
    }
  });
});

describe("classifyUsdcError", () => {
  it("maps network failures to RPC_UNAVAILABLE", () => {
    const error = new Error("connection refused");
    error.name = "HttpRequestError";
    expect(classifyUsdcError(error).code).toBe("RPC_UNAVAILABLE");
  });

  it("maps contract failures to CONTRACT_READ_FAILED", () => {
    const error = new Error("reverted");
    error.name = "ContractFunctionExecutionError";
    expect(classifyUsdcError(error).code).toBe("CONTRACT_READ_FAILED");
  });
});
