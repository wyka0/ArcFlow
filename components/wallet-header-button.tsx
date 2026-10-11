"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useWallet } from "@/components/wallet-provider";
import { shortenAddress } from "@/lib/wallet/state";

const PRIMARY =
  "border-2 border-foreground bg-foreground px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
const DROPDOWN =
  "absolute right-0 top-full mt-1 z-20 flex flex-col border-2 border-foreground bg-background min-w-[160px] shadow-[4px_4px_0_0_rgb(0,0,0)]";
const DROPDOWN_ITEM =
  "border-0 bg-transparent px-3 py-2 text-[10px] font-bold tracking-[0.15em] uppercase text-foreground text-left transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:bg-accent focus:text-foreground";

/**
 * Unified wallet header button.
 *
 * Consolidates wallet connection, network status, and authentication
 * into a single control in the site header.
 *
 * States:
 * - Disconnected: "Connect Wallet"
 * - Connected, not authenticated: shortened address (dropdown: Switch Network, Sign In, Disconnect)
 * - Authenticated: shortened address with chevron (dropdown: Sign Out, Disconnect)
 *
 * Sign In is an explicit action that opens the wallet signing flow.
 * The header never auto-authenticates on wallet connection.
 */
export function WalletHeaderButton() {
  const { session, connection, connect, disconnect, switchNetwork, isConnecting } = useWallet();
  const auth = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const address = session.wallet.address;

  const walletConnected = connection === "connected" || connection === "wrong-network";
  const wrongNetwork = connection === "wrong-network";
  const authenticated = auth.status === "authenticated" && auth.session;

  const toggleDropdown = () => setDropdownOpen((prev) => !prev);
  const closeDropdown = () => setDropdownOpen(false);

  const handleSignOut = async () => {
    closeDropdown();
    await auth.signOut();
  };

  const handleDisconnect = () => {
    closeDropdown();
    disconnect();
  };

  const handleSwitchNetwork = async () => {
    closeDropdown();
    await switchNetwork();
  };

  // No wallet or not connected: show Connect Wallet
  if (!walletConnected) {
    return (
      <button
        className={PRIMARY}
        disabled={isConnecting || connection === "wallet-not-detected"}
        onClick={() => void connect()}
        type="button"
        title={
          connection === "wallet-not-detected"
            ? "No injected EVM wallet was found in this browser."
            : "Connect an injected EVM wallet (read-only)"
        }
      >
        {connection === "wallet-not-detected"
          ? "Wallet not detected"
          : isConnecting
          ? "Connecting…"
          : "Connect Wallet"}
      </button>
    );
  }

  // Connected: show address with dropdown
  return (
    <div className="relative">
      <button
        className={PRIMARY}
        onClick={toggleDropdown}
        type="button"
        aria-expanded={dropdownOpen}
        aria-haspopup="menu"
        title={address ?? undefined}
      >
        <span className="flex items-center gap-1.5">
          {shortenAddress(address ?? "—")}
          <span aria-hidden>▾</span>
        </span>
      </button>

      {dropdownOpen && (
        <div className={DROPDOWN} role="menu">
          {wrongNetwork && (
            <button
              className={DROPDOWN_ITEM}
              onClick={() => void handleSwitchNetwork()}
              role="menuitem"
              type="button"
            >
              Switch to Arc
            </button>
          )}
          {!authenticated && (
            <button
              className={DROPDOWN_ITEM}
              onClick={() => {
                closeDropdown();
                // Navigate to main content where Sign In is available
                // The main app content will render the Sign In action
                document.getElementById("sign-in-section")?.scrollIntoView({ behavior: "smooth" });
              }}
              role="menuitem"
              type="button"
            >
              Sign In
            </button>
          )}
          {authenticated && (
            <button
              className={DROPDOWN_ITEM}
              onClick={() => void handleSignOut()}
              role="menuitem"
              type="button"
            >
              Sign Out
            </button>
          )}
          <button
            className={DROPDOWN_ITEM}
            onClick={() => void handleDisconnect()}
            role="menuitem"
            type="button"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}