"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { useAuth, useInjectedSignMessage } from "@/components/auth-provider";
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
 * Sign In triggers the full challenge → sign → verify flow using the
 * injected wallet. It never auto-authenticates on wallet connection.
 */
export function WalletHeaderButton() {
  const { session, connection, connect, disconnect, switchNetwork, isConnecting, clearError } = useWallet();
  const auth = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const address = session.wallet.address;
  const connectionError = session.wallet.error;

  const walletConnected = connection === "connected" || connection === "wrong-network";
  const wrongNetwork = connection === "wrong-network";
  const authenticated = auth.status === "authenticated" && auth.session;
  const injected = useInjectedSignMessage(address);

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

  const handleSignIn = async () => {
    closeDropdown();
    if (!address || !injected) {
      setSignInError("Connect your wallet first.");
      return;
    }
    setSignInBusy(true);
    setSignInError(null);
    try {
      await auth.signIn({ walletAddress: address, signMessage: injected });
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setSignInBusy(false);
    }
  };

  // No wallet or not connected: show Connect Wallet
  if (!walletConnected) {
    return (
      <>
        {connectionError && (
          <div className="absolute right-0 top-full mt-2 z-20 flex min-w-[200px] flex-col gap-2 rounded-lg border border-destructive bg-popover p-3 text-sm text-destructive shadow-md">
            <span className="font-medium">Connection failed</span>
            <span className="text-xs text-muted-foreground">{connectionError.message}</span>
            <button
              className="self-start text-xs text-accent hover:underline"
              onClick={() => clearError()}
              type="button"
            >
              Dismiss
            </button>
          </div>
        )}
        <button
          className={PRIMARY}
          disabled={isConnecting || connection === "wallet-not-detected"}
          onClick={() => {
            clearError();
            void connect();
          }}
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
      </>
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

      {signInBusy && (
        <span className="absolute right-0 top-full mt-2 z-20 flex min-w-[176px] items-center gap-2 rounded-lg border border-border bg-popover p-3 text-sm text-muted-foreground shadow-md">
          <Loader2 className="size-4 animate-spin" />
          Signing in…
        </span>
      )}

      {!signInBusy && signInError && (
        <span className="absolute right-0 top-full mt-2 z-20 flex min-w-[200px] flex-col gap-2 rounded-lg border border-destructive bg-popover p-3 text-sm text-destructive shadow-md">
          <span className="font-medium">Sign-in failed</span>
          <span className="text-xs text-muted-foreground">{signInError}</span>
          <button
            className="self-start text-xs text-accent hover:underline"
            onClick={() => setSignInError(null)}
            type="button"
          >
            Dismiss
          </button>
        </span>
      )}

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
              onClick={() => void handleSignIn()}
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
