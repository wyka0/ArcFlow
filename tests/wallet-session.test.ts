import { describe, expect, it } from "vitest";

import { ARC_MAINNET } from "@/lib/arc/network";
import {
  initialWalletSessionState,
  selectBalanceDisplay,
  selectConnectionDisplay,
  selectNetworkStatus,
  walletSessionReducer,
  type WalletSessionState,
} from "@/lib/wallet/session";
import { parseChainId, shortenAddress } from "@/lib/wallet/state";

const ADDRESS = "0xAbC1234567890aBcD1234567890abcD123456789" as const;

function connectedState(chainId = ARC_MAINNET.chainId): WalletSessionState {
  return walletSessionReducer(
    walletSessionReducer(initialWalletSessionState, { type: "provider/detected" }),
    { type: "connect/succeeded", address: ADDRESS, chainId },
  );
}

describe("wallet session — disconnected state", () => {
  it("starts disconnected with no address", () => {
    const state = initialWalletSessionState;
    expect(state.wallet.status).toBe("disconnected");
    expect(state.wallet.address).toBeNull();
    expect(state.balance.status).toBe("idle");
  });

  it("reports not-connected before a wallet connects", () => {
    const state = walletSessionReducer(initialWalletSessionState, { type: "provider/detected" });
    expect(selectConnectionDisplay(state, ARC_MAINNET)).toBe("not-connected");
    expect(selectBalanceDisplay(state, ARC_MAINNET)).toEqual({ kind: "not-connected" });
  });

  it("reports wallet-not-detected when no provider exists", () => {
    const state = walletSessionReducer(initialWalletSessionState, { type: "provider/missing" });
    expect(selectConnectionDisplay(state, ARC_MAINNET)).toBe("wallet-not-detected");
    expect(selectNetworkStatus(state, ARC_MAINNET)).toEqual({ kind: "no-wallet" });
  });

  it("disconnect returns to the honest disconnected state", () => {
    const state = walletSessionReducer(connectedState(), { type: "disconnect" });
    expect(state.wallet.status).toBe("disconnected");
    expect(state.wallet.address).toBeNull();
    expect(state.balance).toEqual({ status: "idle" });
    expect(selectBalanceDisplay(state, ARC_MAINNET)).toEqual({ kind: "not-connected" });
  });
});

describe("wallet session — connected state", () => {
  it("stores the address on success", () => {
    const state = connectedState();
    expect(state.wallet.status).toBe("connected");
    expect(state.wallet.address).toBe(ADDRESS);
    expect(selectConnectionDisplay(state, ARC_MAINNET)).toBe("connected");
  });

  it("starts reading the balance once connected on the right chain", () => {
    expect(selectBalanceDisplay(connectedState(), ARC_MAINNET)).toEqual({ kind: "reading" });
  });

  it("surfaces an available balance", () => {
    const state = walletSessionReducer(connectedState(), {
      type: "balance/available",
      amount: 1_500_000n,
      formatted: "1.50",
      decimals: 6,
      blockNumber: 100n,
      readAt: "2026-09-21T10:00:00.000Z",
    });
    expect(selectBalanceDisplay(state, ARC_MAINNET)).toEqual({
      kind: "available",
      formatted: "1.50",
      readAt: "2026-09-21T10:00:00.000Z",
      blockNumber: 100n,
    });
  });

  it("reports balance unavailable without pretending zero", () => {
    const state = walletSessionReducer(connectedState(), {
      type: "balance/unavailable",
      code: "RPC_UNAVAILABLE",
      message: "Could not reach the Arc RPC endpoint. Balance unavailable.",
    });
    expect(selectBalanceDisplay(state, ARC_MAINNET)).toEqual({
      kind: "unavailable",
      message: "Could not reach the Arc RPC endpoint. Balance unavailable.",
    });
  });

  it("marks the network unavailable when the RPC fails", () => {
    const state = walletSessionReducer(connectedState(), {
      type: "balance/unavailable",
      code: "RPC_UNAVAILABLE",
      message: "unavailable",
    });
    expect(selectNetworkStatus(state, ARC_MAINNET)).toEqual({ kind: "rpc-unavailable" });
  });

  it("clears accounts on accounts/changed with no accounts", () => {
    const state = walletSessionReducer(connectedState(), { type: "accounts/changed", address: null });
    expect(state.wallet.status).toBe("disconnected");
    expect(state.balance).toEqual({ status: "idle" });
  });
});

describe("wallet session — wrong network state", () => {
  it("detects a mismatch without switching", () => {
    const state = connectedState(1);
    expect(selectConnectionDisplay(state, ARC_MAINNET)).toBe("wrong-network");
    expect(selectNetworkStatus(state, ARC_MAINNET)).toEqual({ kind: "wrong-network", chainId: 1 });
    expect(selectBalanceDisplay(state, ARC_MAINNET)).toEqual({ kind: "wrong-network" });
  });

  it("never reads a balance while on the wrong chain", () => {
    const wrong = connectedState(1);
    const loading = walletSessionReducer(wrong, { type: "balance/loading" });
    expect(selectBalanceDisplay(loading, ARC_MAINNET)).toEqual({ kind: "wrong-network" });
  });

  it("returns to connected once the chain matches Arc", () => {
    const state = walletSessionReducer(connectedState(1), {
      type: "chain/changed",
      chainId: ARC_MAINNET.chainId,
    });
    expect(selectConnectionDisplay(state, ARC_MAINNET)).toBe("connected");
  });
});

describe("wallet helpers", () => {
  it("shortens an address", () => {
    expect(shortenAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
  });

  it("parses hex and decimal chain ids", () => {
    expect(parseChainId("0x13b2")).toBe(5042);
    expect(parseChainId("0x4cef52")).toBe(5042002);
    expect(parseChainId(5042)).toBe(5042);
    expect(parseChainId("nope")).toBeNull();
    expect(parseChainId(null)).toBeNull();
  });
});
