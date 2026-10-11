"use client";

import { useCallback, useState } from "react";
import { useAuth, useInjectedSignMessage } from "@/components/auth-provider";
import { useWallet } from "@/components/wallet-provider";
import { shortenAddress } from "@/lib/wallet/state";

const PRIMARY =
  "border-2 border-foreground bg-foreground px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY =
  "border border-foreground/40 px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
const STATUS =
  "border-2 border-accent bg-accent px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-accent-foreground";

/**
 * Auth button.
 *
 * Sequential UX:
 *  - No wallet connected        → render nothing (Connect Wallet is the
 *                                 only available action).
 *  - Wallet connected, no auth  → render "Sign in" (explicit, no auto-sign).
 *  - Authenticated              → render the authenticated wallet identity
 *                                 and a "Sign out" button.
 *
 * Signing is always explicit: the user clicks the button, the wallet
 * shows the challenge message, and the user confirms. The auth button
 * never signs automatically.
 */
export function AuthButton() {
  const { session, connection } = useWallet();
  const auth = useAuth();
  const injected = useInjectedSignMessage(session.wallet.address ?? undefined);
  const [pending, setPending] = useState(false);

  const walletConnected = connection === "connected" || connection === "wrong-network";
  const address = session.wallet.address;

  const onSignIn = useCallback(async () => {
    if (!address || !injected) return;
    setPending(true);
    try {
      await auth.signIn({ walletAddress: address, signMessage: injected });
    } catch {
      // Error already recorded in auth context.
    } finally {
      setPending(false);
    }
  }, [address, injected, auth]);

  const onSignOut = useCallback(async () => {
    setPending(true);
    try {
      await auth.signOut();
    } finally {
      setPending(false);
    }
  }, [auth]);

  // No wallet available: do not show a Sign in button. The Connect Wallet
  // button is the only action at this stage.
  if (!walletConnected) {
    return null;
  }

  if (auth.status === "authenticated" && auth.session) {
    return (
      <div className="flex items-center gap-2">
        <span
          className={STATUS}
          title={auth.session.walletAddress}
        >
          Auth · {shortenAddress(auth.session.walletAddress)}
        </span>
        <button className={SECONDARY} disabled={pending} onClick={() => void onSignOut()} type="button">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className={PRIMARY}
        disabled={pending || !injected}
        onClick={() => void onSignIn()}
        type="button"
        title={
          injected
            ? "Sign an authentication message with your connected wallet"
            : "No injected wallet is available"
        }
      >
        {pending ? "Signing…" : "Sign in"}
      </button>
      {auth.error ? (
        <span className="text-[9px] tracking-[0.15em] text-accent uppercase" role="alert">
          {auth.error}
        </span>
      ) : null}
    </div>
  );
}
