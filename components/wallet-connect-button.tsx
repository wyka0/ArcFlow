"use client";

import { useWallet } from "@/components/wallet-provider";
import { shortenAddress } from "@/lib/wallet/state";

const PRIMARY =
  "border-2 border-foreground bg-foreground px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY =
  "border border-foreground/40 px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

export function WalletConnectButton() {
  const { session, connection, connect, disconnect, switchNetwork, isConnecting } = useWallet();
  const { address, error } = session.wallet;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {connection === "connected" || connection === "wrong-network" ? (
          <>
            {connection === "wrong-network" ? (
              <button className={PRIMARY} onClick={() => void switchNetwork()} type="button">
                Switch to Arc
              </button>
            ) : null}
            <span
              className="border border-foreground/40 px-2 py-1.5 text-[10px] tracking-[0.15em] uppercase"
              title={address ?? undefined}
            >
              {address ? shortenAddress(address) : "—"}
            </span>
            <button className={SECONDARY} onClick={disconnect} type="button">
              Disconnect
            </button>
          </>
        ) : (
          <button
            className={PRIMARY}
            disabled={isConnecting || connection === "wallet-not-detected"}
            onClick={() => void connect()}
            title={
              connection === "wallet-not-detected"
                ? "No injected EVM wallet was found in this browser."
                : "Connect an injected EVM wallet (read-only)"
            }
            type="button"
          >
            {connection === "wallet-not-detected"
              ? "Wallet not detected"
              : isConnecting
                ? "Connecting…"
                : "Connect Wallet"}
          </button>
        )}
      </div>
      {error ? (
        <span className="text-[9px] tracking-[0.15em] text-accent uppercase" role="alert">
          {error.message}
        </span>
      ) : null}
    </div>
  );
}
