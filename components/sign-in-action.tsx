"use client";

import { useCallback } from "react";
import { useAuth, useInjectedSignMessage } from "@/components/auth-provider";
import { useWallet } from "@/components/wallet-provider";

const PRIMARY =
  "border-2 border-foreground bg-foreground px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-background transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Explicit Sign In action for the main app content.
 *
 * Only renders when:
 * - Wallet is connected
 * - User is NOT authenticated
 *
 * This keeps authentication as an explicit user action, separate from
 * wallet connection. The header never auto-authenticates.
 */
export function SignInAction() {
  const { session, connection } = useWallet();
  const auth = useAuth();
  const injected = useInjectedSignMessage(session.wallet.address ?? undefined);

  const walletConnected = connection === "connected" || connection === "wrong-network";
  const address = session.wallet.address;

  const onSignIn = useCallback(async () => {
    if (!address || !injected) return;
    await auth.signIn({ walletAddress: address, signMessage: injected });
  }, [address, injected, auth]);

  if (!walletConnected || auth.status === "authenticated") {
    return null;
  }

  return (
    <section id="sign-in-section" className="px-6 pb-8 lg:px-12">
      <div className="mx-auto max-w-2xl">
        <div className="border-2 border-foreground bg-background/80 p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Authentication Required
            </span>
            <p className="text-sm text-foreground max-w-md">
              Connect your wallet and sign the authentication message to enable
              agent payments and service requests.
            </p>
            <button
              className={PRIMARY}
              disabled={!injected}
              onClick={() => void onSignIn()}
              type="button"
            >
              Sign In
            </button>
            {auth.error && (
              <p className="text-[10px] tracking-[0.15em] text-accent uppercase" role="alert">
                {auth.error}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}