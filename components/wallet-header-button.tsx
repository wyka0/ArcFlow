"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { useWallet } from "@/components/wallet-provider";
import { shortenAddress } from "@/lib/wallet/state";

const PRIMARY =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
const DROPDOWN =
  "absolute right-0 top-full mt-2 z-20 flex min-w-[176px] flex-col overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-md";
const DROPDOWN_ITEM =
  "w-full rounded-md bg-transparent px-3 py-2 text-left text-sm font-medium text-popover-foreground transition-colors hover:bg-muted focus:bg-muted focus:outline-none";

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
          <ChevronDown className="size-4" aria-hidden />
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