"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { custom } from "viem";

import { createArcReadClient } from "@/lib/arc/client";
import { getActiveArcNetwork, type ArcNetwork } from "@/lib/arc/network";
import { readUsdcBalance } from "@/lib/arc/usdc";
import {
  getAccounts,
  getChainId,
  getInjectedProvider,
  requestAccounts,
  subscribeProvider,
  switchToArcNetwork,
  type Eip1193Provider,
} from "@/lib/wallet/client";
import {
  initialWalletSessionState,
  selectBalanceDisplay,
  selectConnectionDisplay,
  selectNetworkStatus,
  walletSessionReducer,
  type BalanceDisplay,
  type ConnectionDisplay,
  type NetworkStatus,
  type WalletSessionState,
} from "@/lib/wallet/session";
import { WalletClientError, toWalletError } from "@/lib/wallet/state";

export interface WalletContextValue {
  session: WalletSessionState;
  network: ArcNetwork;
  connection: ConnectionDisplay;
  networkStatus: NetworkStatus;
  balance: BalanceDisplay;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  refreshBalance: () => void;
  providerRef: React.RefObject<Eip1193Provider | null>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(walletSessionReducer, initialWalletSessionState);
  const [refreshNonce, bumpRefresh] = useReducer((nonce: number) => nonce + 1, 0);
  const providerRef = useRef<Eip1193Provider | null>(null);
  const network = useMemo(() => getActiveArcNetwork(), []);

  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 20; // ~10 seconds at 500ms intervals
    const RETRY_MS = 500;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let generation = 0; // Prevents stale async responses from overwriting newer state

    function attemptDetect(): void {
      if (cancelled) return;
      if (providerRef.current) return; // Already detected — no duplicate

      const provider = getInjectedProvider();

      if (!provider) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          retryTimer = setTimeout(attemptDetect, RETRY_MS);
          return;
        }
        // Retries exhausted — wallet is truly not installed
        dispatch({ type: "provider/missing" });
        return;
      }

      // Provider found — run existing detection and subscription logic
      providerRef.current = provider;
      dispatch({ type: "provider/detected" });

      const currentGeneration = ++generation;

      void (async () => {
        try {
          const [accounts, chainId] = await Promise.all([getAccounts(provider), getChainId(provider)]);
          if (cancelled || generation !== currentGeneration) return;
          const address = accounts[0];
          if (address) {
            dispatch({ type: "connect/succeeded", address, chainId });
          } else {
            dispatch({ type: "chain/changed", chainId });
          }
        } catch {
          if (!cancelled && generation === currentGeneration) {
            dispatch({ type: "wallet/error/clear" });
          }
        }
      })();

      unsubscribe = subscribeProvider(provider, {
        onAccountsChanged: (accounts) =>
          dispatch({ type: "accounts/changed", address: accounts[0] ?? null }),
        onChainChanged: (chainId) => dispatch({ type: "chain/changed", chainId }),
      });
    }

    // Check immediately on mount
    attemptDetect();

    // Listen for the MetaMask-style initialization event for faster detection
    function onEthereumInitialized(): void {
      if (cancelled) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      retryCount = 0; // Reset so future retries can still occur if this event fires early
      attemptDetect();
    }
    window.addEventListener("ethereum#initialized", onEthereumInitialized, { once: true });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("ethereum#initialized", onEthereumInitialized);
      unsubscribe?.();
    };
  }, []);

  const { status: walletStatus, address: walletAddress, chainId: walletChainId } = session.wallet;

  useEffect(() => {
    if (walletStatus !== "connected" || !walletAddress || walletChainId !== network.chainId) return;

    const provider = providerRef.current;
    if (!provider) return;

    let cancelled = false;
    dispatch({ type: "balance/loading" });

    void (async () => {
      const client = createArcReadClient(network, custom({ request: (args) => provider.request(args) }));
      const result = await readUsdcBalance({ client, network, address: walletAddress });
      if (cancelled) return;

      if (result.ok) {
        dispatch({
          type: "balance/available",
          amount: result.value.amount,
          formatted: result.value.formatted,
          decimals: result.value.decimals,
          blockNumber: result.value.blockNumber,
          readAt: result.value.readAt,
        });
      } else {
        dispatch({
          type: "balance/unavailable",
          code: result.error.code,
          message: result.error.message,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletStatus, walletAddress, walletChainId, network, refreshNonce]);

  const connect = useCallback(async () => {
    const provider = providerRef.current ?? getInjectedProvider();
    if (!provider) {
      dispatch({ type: "provider/missing" });
      return;
    }
    providerRef.current = provider;
    dispatch({ type: "connect/start" });

    try {
      const accounts = await requestAccounts(provider);
      const address = accounts[0];
      if (!address) {
        throw new WalletClientError("CONNECTION_FAILED", "The wallet did not return an account.");
      }
      const chainId = await getChainId(provider);
      dispatch({ type: "connect/succeeded", address, chainId });
    } catch (error) {
      dispatch({ type: "connect/failed", error: toWalletError(error) });
    }
  }, []);

  const disconnect = useCallback(() => {
    dispatch({ type: "disconnect" });
  }, []);

  const switchNetwork = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) {
      dispatch({ type: "provider/missing" });
      return;
    }
    try {
      await switchToArcNetwork(provider, network);
      dispatch({ type: "chain/changed", chainId: await getChainId(provider) });
    } catch (error) {
      dispatch({ type: "wallet/error", error: toWalletError(error) });
    }
  }, [network]);

  const refreshBalance = useCallback(() => bumpRefresh(), []);

  const value = useMemo<WalletContextValue>(
    () => ({
      session,
      network,
      connection: selectConnectionDisplay(session, network),
      networkStatus: selectNetworkStatus(session, network),
      balance: selectBalanceDisplay(session, network),
      isConnecting: session.wallet.status === "connecting",
      connect,
      disconnect,
      switchNetwork,
      refreshBalance,
      providerRef,
    }),
    [session, network, connect, disconnect, switchNetwork, refreshBalance, providerRef],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider.");
  }
  return context;
}
