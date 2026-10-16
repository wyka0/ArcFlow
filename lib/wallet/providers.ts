/**
 * Phase 23.67 — multi-wallet provider selection (pure helpers).
 *
 * `window.ethereum.providers` ordering is provider-defined and unreliable, so
 * selecting `providers[0]` can silently bind the app to a wallet the user did
 * not intend. These helpers make discovery explicit and deterministic:
 *  - one provider  → that provider (unchanged single-wallet behavior)
 *  - none          → none
 *  - many          → the explicitly selected provider, else none (never inferred)
 *
 * They are pure (no React, no `window`) so the selection logic is unit-testable.
 * No provider object is ever persisted.
 */

import type { Eip1193Provider } from "./client";

export interface InjectedProviderOption {
  provider: Eip1193Provider;
  /** Stable index within the detected list. */
  index: number;
  /** Non-authoritative hint label; never used to assume a preference. */
  label: string;
}

/**
 * Collect injected EIP-1193 providers in a stable order:
 * `providers[]` when present, otherwise the single `window.ethereum` object.
 */
export function listInjectedProviders(ethereum: unknown): Eip1193Provider[] {
  if (typeof ethereum !== "object" || ethereum === null) return [];

  const multi = (ethereum as { providers?: unknown }).providers;
  if (Array.isArray(multi) && multi.length > 0) {
    return multi.filter(
      (candidate): candidate is Eip1193Provider =>
        typeof (candidate as Eip1193Provider | undefined)?.request === "function",
    );
  }

  return typeof (ethereum as Eip1193Provider).request === "function"
    ? [ethereum as Eip1193Provider]
    : [];
}

const PROVIDER_HINTS: ReadonlyArray<readonly [string, string]> = [
  ["isMetaMask", "MetaMask"],
  ["isCoinbaseWallet", "Coinbase Wallet"],
  ["isRabby", "Rabby"],
  ["isBraveWallet", "Brave Wallet"],
  ["isPhantom", "Phantom"],
];

/** A best-effort display label. Absence of a hint is not an error. */
export function describeInjectedProvider(provider: Eip1193Provider, index: number): string {
  const record = provider as unknown as Record<string, unknown>;
  for (const [flag, name] of PROVIDER_HINTS) {
    if (record[flag] === true) return name;
  }
  return `Injected wallet ${index + 1}`;
}

export function listInjectedProviderOptions(ethereum: unknown): InjectedProviderOption[] {
  return listInjectedProviders(ethereum).map((provider, index) => ({
    provider,
    index,
    label: describeInjectedProvider(provider, index),
  }));
}

/**
 * Resolve which provider to use.
 *  - 0 providers → `null`
 *  - exactly 1   → that provider (unchanged single-wallet behavior)
 *  - >1          → the explicitly selected index, else `null` (never silently inferred)
 */
export function resolveInjectedProvider(
  providers: readonly Eip1193Provider[],
  selectedIndex: number | null,
): Eip1193Provider | null {
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0];
  if (selectedIndex === null) return null;
  return providers[selectedIndex] ?? null;
}
