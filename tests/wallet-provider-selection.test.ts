/**
 * Phase 23.67 — multi-wallet provider selection.
 *
 * Verifies the app never silently assumes `window.ethereum.providers[0]` is the
 * user's wallet: with several injected providers it requires an explicit choice,
 * while the single-provider and no-provider paths are unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  describeInjectedProvider,
  listInjectedProviderOptions,
  listInjectedProviders,
  resolveInjectedProvider,
} from "@/lib/wallet/providers";
import {
  getInjectedProvider,
  getInjectedProviderOptions,
  getInjectedProviders,
  isWalletAvailable,
  needsInjectedProviderSelection,
  resetInjectedProviderSelection,
  selectInjectedProvider,
  type Eip1193Provider,
} from "@/lib/wallet/client";

function makeProvider(flags: Record<string, unknown> = {}): Eip1193Provider {
  return { request: vi.fn(async () => null), ...flags } as unknown as Eip1193Provider;
}

describe("listInjectedProviders — pure", () => {
  it("returns [] for null / undefined / non-objects", () => {
    expect(listInjectedProviders(null)).toEqual([]);
    expect(listInjectedProviders(undefined)).toEqual([]);
    expect(listInjectedProviders("nope")).toEqual([]);
    expect(listInjectedProviders(42)).toEqual([]);
  });

  it("returns the single window.ethereum object when present", () => {
    const p = makeProvider();
    expect(listInjectedProviders(p)).toEqual([p]);
  });

  it("returns the providers[] array when present", () => {
    const a = makeProvider();
    const b = makeProvider();
    expect(listInjectedProviders({ providers: [a, b] })).toEqual([a, b]);
  });

  it("filters out entries without a request() function", () => {
    const a = makeProvider();
    const bogus = { notAProvider: true };
    const list = listInjectedProviders({ providers: [a, bogus, null] });
    expect(list).toEqual([a]);
  });

  it("ignores an empty providers[] and falls back to the object itself", () => {
    const holder = makeProvider();
    const withEmpty = { ...holder, providers: [] };
    expect(listInjectedProviders(withEmpty)).toEqual([withEmpty]);
  });
});

describe("resolveInjectedProvider — pure selection rules", () => {
  it("returns null when there are no providers", () => {
    expect(resolveInjectedProvider([], null)).toBeNull();
    expect(resolveInjectedProvider([], 0)).toBeNull();
  });

  it("returns the sole provider regardless of selection (single-wallet unchanged)", () => {
    const a = makeProvider();
    expect(resolveInjectedProvider([a], null)).toBe(a);
    expect(resolveInjectedProvider([a], 5)).toBe(a);
  });

  it("returns null for multiple providers with no explicit selection", () => {
    const a = makeProvider();
    const b = makeProvider();
    expect(resolveInjectedProvider([a, b], null)).toBeNull();
  });

  it("returns the explicitly selected provider", () => {
    const a = makeProvider();
    const b = makeProvider();
    expect(resolveInjectedProvider([a, b], 1)).toBe(b);
    expect(resolveInjectedProvider([a, b], 0)).toBe(a);
  });

  it("returns null when the selected index is out of range", () => {
    const a = makeProvider();
    const b = makeProvider();
    expect(resolveInjectedProvider([a, b], 9)).toBeNull();
  });
});

describe("describeInjectedProvider — hint labels", () => {
  it("uses a known wallet hint when present", () => {
    expect(describeInjectedProvider(makeProvider({ isMetaMask: true }), 0)).toBe("MetaMask");
    expect(describeInjectedProvider(makeProvider({ isCoinbaseWallet: true }), 1)).toBe("Coinbase Wallet");
  });

  it("falls back to a neutral index label when no hint is present", () => {
    expect(describeInjectedProvider(makeProvider(), 0)).toBe("Injected wallet 1");
    expect(describeInjectedProvider(makeProvider(), 2)).toBe("Injected wallet 3");
  });
});

describe("client selection API — mocked window", () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {};
    resetInjectedProviderSelection();
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
    resetInjectedProviderSelection();
    vi.restoreAllMocks();
  });

  function setEthereum(value: unknown) {
    (globalThis as Record<string, unknown>).window = { ethereum: value };
  }

  it("reports no providers when ethereum is absent", () => {
    expect(getInjectedProviders()).toEqual([]);
    expect(getInjectedProvider()).toBeNull();
    expect(isWalletAvailable()).toBe(false);
    expect(needsInjectedProviderSelection()).toBe(false);
  });

  it("uses the single provider (unchanged behavior)", () => {
    const p = makeProvider();
    setEthereum(p);
    expect(getInjectedProviders()).toEqual([p]);
    expect(getInjectedProvider()).toBe(p);
    expect(isWalletAvailable()).toBe(true);
    expect(needsInjectedProviderSelection()).toBe(false);
  });

  it("requires an explicit choice with multiple providers", () => {
    const a = makeProvider();
    const b = makeProvider();
    setEthereum({ providers: [a, b] });

    // Detected, but not silently chosen.
    expect(isWalletAvailable()).toBe(true);
    expect(getInjectedProvider()).toBeNull();
    expect(needsInjectedProviderSelection()).toBe(true);

    const options = getInjectedProviderOptions();
    expect(options.map((o) => o.index)).toEqual([0, 1]);

    selectInjectedProvider(1);
    expect(getInjectedProvider()).toBe(b);
    expect(needsInjectedProviderSelection()).toBe(false);

    resetInjectedProviderSelection();
    expect(getInjectedProvider()).toBeNull();
    expect(needsInjectedProviderSelection()).toBe(true);
  });

  it("lists options with labels for a chooser without binding a provider object", () => {
    const a = makeProvider({ isMetaMask: true });
    const b = makeProvider();
    const options = listInjectedProviderOptions({ providers: [a, b] });
    expect(options.map((o) => o.label)).toEqual(["MetaMask", "Injected wallet 2"]);
  });
});

/**
 * UI note: the project test stack has no DOM (vitest environment "node"; no
 * jsdom/@testing-library), so the picker component itself cannot be rendered in
 * tests. These cases model the picker's decision flow exactly as the component
 * uses the selection API (visibility → choose → bind → hide).
 */
describe("picker flow — modeled via the selection API", () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {};
    resetInjectedProviderSelection();
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
    resetInjectedProviderSelection();
  });

  function setEthereum(value: unknown) {
    (globalThis as Record<string, unknown>).window = { ethereum: value };
  }

  it("shows the picker and binds nothing when several wallets are detected", () => {
    setEthereum({ providers: [makeProvider(), makeProvider()] });
    expect(needsInjectedProviderSelection()).toBe(true); // picker visible
    expect(getInjectedProvider()).toBeNull(); // nothing bound yet
  });

  it("choosing an option binds exactly that provider and hides the picker", () => {
    const a = makeProvider();
    const b = makeProvider();
    setEthereum({ providers: [a, b] });
    const chosen = getInjectedProviderOptions()[1];
    selectInjectedProvider(chosen.index);
    expect(getInjectedProvider()).toBe(b);
    expect(needsInjectedProviderSelection()).toBe(false);
  });

  it("re-resolves the chosen provider after clearing a stale binding", () => {
    const a = makeProvider();
    const b = makeProvider();
    setEthereum({ providers: [a, b] });
    // The picker records the choice and clears any stale provider ref before
    // connect(); connect() then resolves via providerRef.current ?? getInjectedProvider().
    const staleRef: { current: Eip1193Provider | null } = { current: a };
    selectInjectedProvider(1);
    staleRef.current = null;
    const provider = staleRef.current ?? getInjectedProvider();
    expect(provider).toBe(b);
  });

  it("never shows the picker for a single wallet (unchanged behavior)", () => {
    const only = makeProvider();
    setEthereum(only);
    expect(needsInjectedProviderSelection()).toBe(false);
    expect(getInjectedProvider()).toBe(only);
  });

  it("shows the picker again after a disconnect reset", () => {
    setEthereum({ providers: [makeProvider(), makeProvider()] });
    selectInjectedProvider(0);
    expect(needsInjectedProviderSelection()).toBe(false);
    resetInjectedProviderSelection(); // disconnect()
    expect(needsInjectedProviderSelection()).toBe(true);
    expect(getInjectedProvider()).toBeNull();
  });
});
