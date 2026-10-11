import type { Address } from "viem";

import type { ArcNetwork } from "@/lib/arc/network";
import type { UsdcBalanceErrorCode } from "@/lib/arc/usdc";
import { initialWalletState, type WalletError, type WalletState } from "./state";

/**
 * Balance is modelled as an explicit lifecycle rather than a single loading
 * flag, so the UI can distinguish "not connected" from "reading" from
 * "unavailable". A failed read never becomes `0`.
 */
export type BalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "available";
      amount: bigint;
      formatted: string;
      decimals: number;
      blockNumber: bigint;
      readAt: string;
    }
  | { status: "unavailable"; code: UsdcBalanceErrorCode; message: string };

export interface WalletSessionState {
  wallet: WalletState;
  balance: BalanceState;
}

export const initialWalletSessionState: WalletSessionState = {
  wallet: initialWalletState,
  balance: { status: "idle" },
};

export type WalletSessionAction =
  | { type: "provider/detected" }
  | { type: "provider/missing" }
  | { type: "connect/start" }
  | { type: "connect/succeeded"; address: Address; chainId: number | null }
  | { type: "connect/failed"; error: WalletError }
  | { type: "accounts/changed"; address: Address | null }
  | { type: "chain/changed"; chainId: number | null }
  | { type: "wallet/error"; error: WalletError }
  | { type: "wallet/error/clear" }
  | { type: "disconnect" }
  | { type: "balance/loading" }
  | { type: "balance/reset" }
  | {
      type: "balance/available";
      amount: bigint;
      formatted: string;
      decimals: number;
      blockNumber: bigint;
      readAt: string;
    }
  | { type: "balance/unavailable"; code: UsdcBalanceErrorCode; message: string };

function disconnectedWallet(wallet: WalletState): WalletState {
  return {
    availability: wallet.availability,
    status: "disconnected",
    address: null,
    chainId: null,
    error: null,
  };
}

export function walletSessionReducer(
  state: WalletSessionState,
  action: WalletSessionAction,
): WalletSessionState {
  switch (action.type) {
    case "provider/detected":
      return { ...state, wallet: { ...state.wallet, availability: "detected" } };

    case "provider/missing":
      return {
        wallet: { ...state.wallet, availability: "not-detected", status: "disconnected", error: null },
        balance: { status: "idle" },
      };

    case "connect/start":
      return {
        wallet: { ...state.wallet, status: "connecting", error: null },
        balance: { status: "idle" },
      };

    case "connect/succeeded":
      return {
        wallet: {
          ...state.wallet,
          status: "connected",
          address: action.address,
          chainId: action.chainId,
          error: null,
        },
        balance: { status: "idle" },
      };

    case "connect/failed":
      return {
        wallet: { ...disconnectedWallet(state.wallet), error: action.error },
        balance: { status: "idle" },
      };

    case "accounts/changed": {
      if (!action.address) {
        return { wallet: disconnectedWallet(state.wallet), balance: { status: "idle" } };
      }
      return {
        wallet: { ...state.wallet, status: "connected", address: action.address, error: null },
        balance: { status: "idle" },
      };
    }

    case "chain/changed":
      return {
        wallet: { ...state.wallet, chainId: action.chainId },
        balance: { status: "idle" },
      };

    case "wallet/error":
      return { ...state, wallet: { ...state.wallet, error: action.error } };

    case "wallet/error/clear":
      return { ...state, wallet: { ...state.wallet, error: null } };

    case "disconnect":
      return { wallet: disconnectedWallet(state.wallet), balance: { status: "idle" } };

    case "balance/loading":
      return { ...state, balance: { status: "loading" } };

    case "balance/reset":
      return { ...state, balance: { status: "idle" } };

    case "balance/available":
      return {
        ...state,
        balance: {
          status: "available",
          amount: action.amount,
          formatted: action.formatted,
          decimals: action.decimals,
          blockNumber: action.blockNumber,
          readAt: action.readAt,
        },
      };

    case "balance/unavailable":
      return {
        ...state,
        balance: { status: "unavailable", code: action.code, message: action.message },
      };

    default:
      return state;
  }
}

export function isWrongNetwork(session: WalletSessionState, network: ArcNetwork): boolean {
  return session.wallet.status === "connected" && session.wallet.chainId !== network.chainId;
}

export type NetworkStatus =
  | { kind: "no-wallet" }
  | { kind: "not-connected" }
  | { kind: "wrong-network"; chainId: number | null }
  | { kind: "rpc-unavailable" }
  | { kind: "on-network"; network: ArcNetwork };

export function selectNetworkStatus(
  session: WalletSessionState,
  network: ArcNetwork,
): NetworkStatus {
  if (session.wallet.availability === "not-detected") return { kind: "no-wallet" };
  if (session.wallet.status !== "connected") return { kind: "not-connected" };
  if (session.wallet.chainId !== network.chainId) {
    return { kind: "wrong-network", chainId: session.wallet.chainId };
  }
  if (session.balance.status === "unavailable" && session.balance.code === "RPC_UNAVAILABLE") {
    return { kind: "rpc-unavailable" };
  }
  return { kind: "on-network", network };
}

export type ConnectionDisplay =
  | "wallet-not-detected"
  | "not-connected"
  | "connecting"
  | "wrong-network"
  | "connected";

export function selectConnectionDisplay(
  session: WalletSessionState,
  network: ArcNetwork,
): ConnectionDisplay {
  if (session.wallet.availability === "not-detected") return "wallet-not-detected";
  if (session.wallet.status === "connecting") return "connecting";
  if (session.wallet.status === "connected") {
    return isWrongNetwork(session, network) ? "wrong-network" : "connected";
  }
  return "not-connected";
}

export type BalanceDisplay =
  | { kind: "not-connected" }
  | { kind: "wrong-network" }
  | { kind: "reading" }
  | { kind: "available"; formatted: string; readAt: string; blockNumber: bigint }
  | { kind: "unavailable"; message: string };

export function selectBalanceDisplay(
  session: WalletSessionState,
  network: ArcNetwork,
): BalanceDisplay {
  if (session.wallet.status !== "connected") return { kind: "not-connected" };
  if (isWrongNetwork(session, network)) return { kind: "wrong-network" };

  switch (session.balance.status) {
    case "loading":
      return { kind: "reading" };
    case "available":
      return {
        kind: "available",
        formatted: session.balance.formatted,
        readAt: session.balance.readAt,
        blockNumber: session.balance.blockNumber,
      };
    case "unavailable":
      return { kind: "unavailable", message: session.balance.message };
    default:
      return { kind: "reading" };
  }
}
