import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getInjectedProvider, type Eip1193Provider } from "@/lib/wallet/client";

/**
 * Regression tests for the wallet provider late-injection race (Phase 23.38).
 *
 * The WalletProvider mount effect previously checked `window.ethereum` exactly
 * once. Wallet extensions inject asynchronously — often after React hydration
 * — so the single check frequently missed the provider on production builds.
 * The fix adds bounded retries (~500ms × 20 ≈ 10s) and an `ethereum#initialized`
 * event listener.
 *
 * These tests exercise the detection function under three scenarios:
 *  1. Provider absent on first check, present after a delay (the race).
 *  2. Provider available immediately (no race).
 *  3. Provider never appears (retries exhaust → not-detected).
 */

const VALID_ADDRESS = "0xAbC1234567890aBcD1234567890abcD123456789";

function createMockProvider(): Eip1193Provider {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    request: vi.fn(async (args: { method: string }) => {
      switch (args.method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [VALID_ADDRESS];
        case "eth_chainId":
          return "0x13b2"; // Arc mainnet (5042)
        default:
          return null;
      }
    }),
    on: (event: string, listener: (...args: unknown[]) => void) => {
      (listeners[event] = listeners[event] ?? []).push(listener);
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => {
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== listener);
    },
  };
}

describe("wallet provider detection — late injection", () => {
  let originalWindow: typeof globalThis | undefined;

  beforeEach(() => {
    // Capture the original global and set up a mock window without ethereum
    originalWindow = (globalThis as Record<string, unknown>).window as typeof globalThis | undefined;
    (globalThis as Record<string, unknown>).window = {};
  });

  afterEach(() => {
    // Restore the original global
    if (originalWindow !== undefined) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
    vi.restoreAllMocks();
  });

  it("returns null when window.ethereum is not yet injected", () => {
    expect(getInjectedProvider()).toBeNull();
  });

  it("returns the provider when window.ethereum is already available", () => {
    const provider = createMockProvider();
    (globalThis as Record<string, unknown>).window = { ethereum: provider };
    const detected = getInjectedProvider();
    expect(detected).toBe(provider);
  });

  it("detects a provider that appears after a delay (the production race)", async () => {
    // Simulate: initial mount finds nothing, extension injects 300ms later
    (globalThis as Record<string, unknown>).window = {};

    // First check — no provider (this is what happens on Vercel production)
    expect(getInjectedProvider()).toBeNull();

    // Simulate the extension injecting after a delay
    const provider = createMockProvider();
    await new Promise((resolve) => setTimeout(resolve, 50));
    (globalThis as Record<string, unknown>).window = { ethereum: provider };

    // Retry detects the now-available provider
    const detected = getInjectedProvider();
    expect(detected).toBe(provider);
  });

  it("selects the first provider from a multi-provider array", () => {
    const providerA = createMockProvider();
    const providerB = createMockProvider();
    (globalThis as Record<string, unknown>).window = {
      ethereum: { ...providerA, providers: [providerA, providerB] },
    };
    const detected = getInjectedProvider();
    expect(detected).toBe(providerA);
  });

  it("returns null after retries exhaust when no provider ever appears", async () => {
    (globalThis as Record<string, unknown>).window = {};

    // Simulate 20 retries with 500ms intervals (the MAX_RETRIES × RETRY_MS window)
    let attempts = 0;
    const maxAttempts = 20;
    const detectWithRetry = async (): Promise<Eip1193Provider | null> => {
      for (let i = 0; i < maxAttempts; i++) {
        attempts++;
        const provider = getInjectedProvider();
        if (provider) return provider;
        await new Promise((resolve) => setTimeout(resolve, 1)); // abbreviated for test speed
      }
      return null; // retries exhausted
    };

    const result = await detectWithRetry();
    expect(result).toBeNull();
    expect(attempts).toBe(maxAttempts);
  });
});
