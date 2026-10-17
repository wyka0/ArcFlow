/**
 * Phase 49B.11.2 — wallet network-switch hardening regression tests.
 *
 * Covers:
 *  - chainChanged emission through the real listener path: valid Arc chain id
 *    (0x13b2), Arc -> other chain -> back, and malformed values
 *  - a throwing chain listener never propagating into the provider emitter
 *  - switchToArcNetwork: 4902 -> wallet_addEthereumChain fallback with correct
 *    params; other errors surfaced without an add-chain attempt
 *  - bounded wallet-proxied balance reads: timeout maps to the typed
 *    RPC_UNAVAILABLE state; fast reads pass through; late settlements are
 *    discarded without unhandled rejections and never overwrite the timeout
 */
import { describe, expect, it, vi } from "vitest";

import { subscribeProvider, switchToArcNetwork } from "@/lib/wallet/client";
import { parseChainId } from "@/lib/wallet/state";
import { ARC_MAINNET } from "@/lib/arc/network";
import { readUsdcBalanceWithTimeout, WALLET_BALANCE_TIMEOUT_MS, type UsdcBalanceResult } from "@/lib/arc/usdc";

interface FakeProvider {
  request: (args: { method: string }) => Promise<unknown>;
  on: (event: string, fn: (...args: unknown[]) => void) => void;
  removeListener: (event: string, fn: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
  listeners: Record<string, Array<(...args: unknown[]) => void>>;
  calls: string[];
}

/**
 * Fake EIP-1193 provider with a per-method behavior map and a recorded call
 * log. Unlisted methods fall back to safe defaults (no accounts, chain 0x1).
 */
function makeFakeProvider(
  behaviors: Record<string, () => unknown> = {},
): FakeProvider {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const calls: string[] = [];
  return {
    listeners,
    calls,
    request: async (args: { method: string }) => {
      calls.push(args.method);
      const behavior = behaviors[args.method];
      if (behavior) return behavior();
      if (args.method === "eth_chainId") return "0x1";
      if (args.method === "eth_accounts") return [];
      return "0x0";
    },
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
    },
    removeListener(event, fn) {
      const arr = listeners[event];
      if (arr) {
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      }
    },
    emit(event, ...args: unknown[]) {
      (listeners[event] || []).forEach((fn) => fn(...args));
    },
  };
}

// ============================================================
// 1. chainChanged through the real listener path
// ============================================================

describe("subscribeProvider — chainChanged handling", () => {
  it("parses the valid Arc chain id 0x13b2 to 5042", () => {
    const provider = makeFakeProvider();
    const seen: Array<number | null> = [];
    subscribeProvider(provider, {
      onAccountsChanged: () => {},
      onChainChanged: (chainId) => seen.push(chainId),
    });
    provider.emit("chainChanged", "0x13b2");
    expect(seen).toEqual([5042]);
  });

  it("handles Arc -> another chain -> back to Arc", () => {
    const provider = makeFakeProvider();
    const seen: Array<number | null> = [];
    subscribeProvider(provider, {
      onAccountsChanged: () => {},
      onChainChanged: (chainId) => seen.push(chainId),
    });
    provider.emit("chainChanged", "0x13b2");
    provider.emit("chainChanged", "0x1");
    provider.emit("chainChanged", "0x13b2");
    expect(seen).toEqual([5042, 1, 5042]);
  });

  it("maps malformed chain-change values to null without throwing", () => {
    const provider = makeFakeProvider();
    const seen: Array<number | null> = [];
    subscribeProvider(provider, {
      onAccountsChanged: () => {},
      onChainChanged: (chainId) => seen.push(chainId),
    });
    expect(() => {
      provider.emit("chainChanged", "garbage");
      provider.emit("chainChanged", undefined);
      provider.emit("chainChanged", 0);
    }).not.toThrow();
    expect(seen).toEqual([null, null, null]);
  });

  it("a throwing chain listener never propagates into the provider emitter", () => {
    const provider = makeFakeProvider();
    const seen: Array<number | null> = [];
    expect(() => {
      subscribeProvider(provider, {
        onAccountsChanged: () => {},
        onChainChanged: () => {
          throw new Error("handler exploded");
        },
      });
      // Both a valid emission and a malformed one must not escape the listener.
      provider.emit("chainChanged", "0x13b2");
      provider.emit("chainChanged", "garbage");
    }).not.toThrow();
    // A broken handler receives no further state updates (nothing to dispatch).
    expect(seen).toEqual([]);
  });

  it("preserves valid chain parsing alongside the hardened guard", () => {
    // Direct unit check of the parse semantics the hardened listener relies on.
    expect(parseChainId("0x13b2")).toBe(5042);
    expect(parseChainId("garbage")).toBeNull();
  });
});

// ============================================================
// 2. switchToArcNetwork — 4902 fallback and error surfacing
// ============================================================

describe("switchToArcNetwork — error handling", () => {
  it("falls back to wallet_addEthereumChain on error 4902 with Arc params", async () => {
    const provider = makeFakeProvider({
      wallet_switchEthereumChain: () => {
        const err = new Error("Unrecognized chain") as Error & { code: number };
        err.code = 4902;
        throw err;
      },
    });

    await expect(switchToArcNetwork(provider, ARC_MAINNET)).resolves.toBeUndefined();

    expect(provider.calls).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain"]);
    // The add-chain params carry the exact Arc mainnet metadata. Re-derive the
    // call arguments from the emitted request (the fake records methods only).
    // For param assertions, wrap the provider with an argument recorder:
    const argRecorder: Array<{ method: string; params?: unknown }> = [];
    const recordingProvider = {
      request: async (args: { method: string; params?: unknown }) => {
        argRecorder.push(args);
        if (args.method === "wallet_switchEthereumChain") {
          const err = new Error("Unrecognized chain") as Error & { code: number };
          err.code = 4902;
          throw err;
        }
        return null;
      },
      on: provider.on,
      removeListener: provider.removeListener,
    };
    await switchToArcNetwork(recordingProvider as never, ARC_MAINNET);
    const addCall = argRecorder.find((c) => c.method === "wallet_addEthereumChain");
    expect(addCall).toBeDefined();
    const addParams = (addCall as { params: Array<Record<string, unknown>> }).params[0];
    expect(addParams.chainId).toBe("0x13b2");
    expect(addParams.chainName).toBe(ARC_MAINNET.label);
    expect(addParams.rpcUrls).toEqual([ARC_MAINNET.rpcUrl]);
    expect(addParams.blockExplorerUrls).toEqual([ARC_MAINNET.explorerUrl]);
    expect((addParams.nativeCurrency as { decimals: number }).decimals).toBe(18);
  });

  it("surfaces other switch errors without attempting wallet_addEthereumChain", async () => {
    const provider = makeFakeProvider({
      wallet_switchEthereumChain: () => {
        const err = new Error("User rejected") as Error & { code: number };
        err.code = 4001;
        throw err;
      },
    });

    await expect(switchToArcNetwork(provider, ARC_MAINNET)).rejects.toMatchObject({ code: 4001 });
    expect(provider.calls).toEqual(["wallet_switchEthereumChain"]);
  });
});

// ============================================================
// 3. Bounded wallet-proxied balance reads
// ============================================================

describe("readUsdcBalanceWithTimeout — bounded wallet-proxied reads", () => {
  it("times out to the typed RPC_UNAVAILABLE state when the wallet never responds", async () => {
    const never = new Promise<UsdcBalanceResult>(() => {});
    const result = await readUsdcBalanceWithTimeout(never, 25);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RPC_UNAVAILABLE");
      expect(result.error.message).toContain("did not respond in time");
    }
  });

  it("passes a fast successful read through unchanged", async () => {
    const fast = Promise.resolve({
      ok: true as const,
      value: {
        address: "0x9999999999999999999999999999999999999999" as const,
        amount: 91531n,
        formatted: "0.091531",
        decimals: 6,
        blockNumber: 1n,
        readAt: "t",
      },
    });
    const result = await readUsdcBalanceWithTimeout(fast, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amount).toBe(91531n);
  });

  it("passes a fast typed failure through unchanged", async () => {
    const fastFail = Promise.resolve({
      ok: false as const,
      error: { code: "CONTRACT_READ_FAILED" as const, message: "read failed" },
    });
    const result = await readUsdcBalanceWithTimeout(fastFail, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONTRACT_READ_FAILED");
  });

  it("suppresses a late rejection after the timeout without an unhandled rejection", async () => {
    const lateReject = new Promise<UsdcBalanceResult>((_, reject) => {
      setTimeout(() => reject(new Error("late wallet RPC failure")), 60);
    });
    const result = await readUsdcBalanceWithTimeout(lateReject, 25);
    expect(result.ok).toBe(false);
    // Let the late rejection fire; vitest fails the run on unhandled rejections.
    await new Promise((r) => setTimeout(r, 120));
    expect(result.ok).toBe(false);
  });

  it("discards a late successful settlement after the timeout", async () => {
    const lateSuccess = new Promise<UsdcBalanceResult>((resolve) => {
      setTimeout(() => resolve({
        ok: true,
        value: {
          address: "0x9999999999999999999999999999999999999999" as const,
          amount: 123n,
          formatted: "0.000123",
          decimals: 6,
          blockNumber: 2n,
          readAt: "late",
        },
      }), 60);
    });
    const result = await readUsdcBalanceWithTimeout(lateSuccess, 25);
    // The timeout result is authoritative: the stale late read is discarded.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RPC_UNAVAILABLE");
    await new Promise((r) => setTimeout(r, 120));
  });

  it("uses the documented default timeout", () => {
    expect(WALLET_BALANCE_TIMEOUT_MS).toBe(15_000);
  });
});
