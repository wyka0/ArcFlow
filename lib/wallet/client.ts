import { isAddress, type Address } from "viem";

import type { ArcNetwork } from "@/lib/arc/network";
import { getArcRpcUrl } from "@/lib/arc/network";
import { WalletClientError, getProviderErrorCode, parseChainId } from "./state";

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

/** Returns an injected EVM wallet provider, or null when none is present. */
export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as InjectedWindow).ethereum;
  if (!injected) return null;
  if (Array.isArray(injected.providers) && injected.providers.length > 0) {
    return injected.providers[0];
  }
  return injected;
}

export function isWalletAvailable(): boolean {
  return getInjectedProvider() !== null;
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
    handlers.onChainChanged(parseChainId(args[0]));
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
