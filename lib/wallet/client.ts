import { isAddress, type Address } from "viem";

import type { ArcNetwork } from "@/lib/arc/network";
import { getArcRpcUrl } from "@/lib/arc/network";
import { WalletClientError, getProviderErrorCode, parseChainId } from "./state";
import {
  describeInjectedProvider,
  listInjectedProviders,
  resolveInjectedProvider,
  type InjectedProviderOption,
} from "./providers";

/**
 * Minimal EIP-1193 provider surface. Only the methods AgentPay needs for
 * detection, account access and chain reporting are declared.
 */
export interface Eip1193Provider {
  request(args: {
    method: string;
    params?: readonly unknown[] | Record<string, unknown>;
  }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

interface InjectedWindow {
  ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
}

export type { InjectedProviderOption };

/**
 * In-memory (never persisted) index of the provider the user explicitly chose.
 * `null` means "no explicit choice".
 */
let selectedProviderIndex: number | null = null;

/** All injected EIP-1193 providers, in a stable order. */
export function getInjectedProviders(): Eip1193Provider[] {
  if (typeof window === "undefined") return [];
  const injected = (window as unknown as InjectedWindow).ethereum;
  return listInjectedProviders(injected);
}

/** Detected providers with display labels — for an explicit chooser. */
export function getInjectedProviderOptions(): InjectedProviderOption[] {
  return getInjectedProviders().map((provider, index) => ({
    provider,
    index,
    label: describeInjectedProvider(provider, index),
  }));
}

/** Record the user's explicit provider choice (in-memory only). */
export function selectInjectedProvider(index: number): void {
  selectedProviderIndex = index;
}

/** Clear the explicit choice (e.g. on disconnect). */
export function resetInjectedProviderSelection(): void {
  selectedProviderIndex = null;
}

/**
 * True when more than one wallet is injected and no explicit choice has been
 * made. The UI should ask the user which wallet to use rather than guessing.
 */
export function needsInjectedProviderSelection(): boolean {
  return getInjectedProviders().length > 1 && selectedProviderIndex === null;
}

/**
 * Returns the injected provider to use, or `null` when none is available.
 *
 * With a single wallet this is that wallet (unchanged behavior). With several,
 * it is the explicitly selected one, or `null` until the user chooses — the app
 * never silently assumes `providers[0]` is the user's preferred wallet.
 */
export function getInjectedProvider(): Eip1193Provider | null {
  return resolveInjectedProvider(getInjectedProviders(), selectedProviderIndex);
}

/** True when at least one injected wallet is present (selection aside). */
export function isWalletAvailable(): boolean {
  return getInjectedProviders().length > 0;
}

function normalizeAccounts(value: unknown): Address[] {
  if (!Array.isArray(value)) {
    throw new WalletClientError("CONNECTION_FAILED", "The wallet did not return an account list.");
  }
  const strings = value.filter((entry): entry is string => typeof entry === "string");
  return strings.map((entry) => {
    if (!isAddress(entry, { strict: false })) {
      throw new WalletClientError("MALFORMED_ACCOUNT", "The wallet returned an invalid account address.");
    }
    return entry as Address;
  });
}

export async function getAccounts(provider: Eip1193Provider): Promise<Address[]> {
  return normalizeAccounts(await provider.request({ method: "eth_accounts" }));
}

/** Prompts the user to connect. Never requests signatures or transactions. */
export async function requestAccounts(provider: Eip1193Provider): Promise<Address[]> {
  return normalizeAccounts(await provider.request({ method: "eth_requestAccounts" }));
}

export async function getChainId(provider: Eip1193Provider): Promise<number | null> {
  return parseChainId(await provider.request({ method: "eth_chainId" }));
}

export interface ProviderSubscriptionHandlers {
  onAccountsChanged(accounts: Address[]): void;
  onChainChanged(chainId: number | null): void;
}

export function subscribeProvider(
  provider: Eip1193Provider,
  handlers: ProviderSubscriptionHandlers,
): () => void {
  if (typeof provider.on !== "function") {
    return () => {};
  }

  const accountsListener = (...args: unknown[]) => {
    try {
      handlers.onAccountsChanged(normalizeAccounts(args[0]));
    } catch {
      handlers.onAccountsChanged([]);
    }
  };

  const chainListener = (...args: unknown[]) => {
    try {
      handlers.onChainChanged(parseChainId(args[0]));
    } catch {
      // Mirror the accountsChanged guard: a provider-emitter that propagates
      // listener throws must never crash the page. One neutral fallback keeps
      // the session in the safe wrong-network/unknown state; if even that
      // throws (a broken handler), swallow — there is no safe surface here.
      try {
        handlers.onChainChanged(null);
      } catch {
        /* the handler itself is broken; nothing safe to dispatch */
      }
    }
  };

  provider.on("accountsChanged", accountsListener);
  provider.on("chainChanged", chainListener);

  return () => {
    provider.removeListener?.("accountsChanged", accountsListener);
    provider.removeListener?.("chainChanged", chainListener);
  };
}

function getChainParams(network: ArcNetwork) {
  return {
    chainId: `0x${network.chainId.toString(16)}`,
    chainName: network.label,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: network.nativeUsdcDecimals },
    rpcUrls: [getArcRpcUrl(network)],
    blockExplorerUrls: [network.explorerUrl],
  };
}

/**
 * Explicit, user-initiated network switch. This is only ever called from a
 * button the user presses — the app never switches networks on its own.
 */
export async function switchToArcNetwork(
  provider: Eip1193Provider,
  network: ArcNetwork,
): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${network.chainId.toString(16)}` }],
    });
  } catch (error) {
    if (getProviderErrorCode(error) === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [getChainParams(network)],
      });
      return;
    }
    throw error;
  }
}
