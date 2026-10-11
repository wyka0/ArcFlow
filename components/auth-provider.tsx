"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Address, Hex } from "viem";

import { getInjectedProvider } from "@/lib/wallet/client";
import {
  fetchAuthSession,
  logoutAuth,
  requestAuthChallenge,
  verifyAuthSignature,
  type SanitisedSession,
} from "@/lib/auth/client";

/**
 * Browser-side authentication.
 *
 * Holds the sanitised session view (wallet address, created/expires
 * timestamps). The session id and cookie are never exposed to React.
 *
 * `signIn` is explicit: the user must click "Sign in" and the wallet
 * must display the challenge message. There is no automatic signing
 * on page load, on connect, or on network switch.
 */
export type AuthStatus = "unknown" | "unauthenticated" | "authenticated" | "error";

export interface AuthContextValue {
  status: AuthStatus;
  session: SanitisedSession | null;
  error: string | null;
  /** Re-fetch the session from the server. */
  refresh: () => Promise<void>;
  /**
   * Run the full challenge → sign → verify flow.
   *
   * `signMessage` must be supplied by the caller (typically the
   * injected wallet provider) so the auth layer does not import
   * wallet-internals.
   */
  signIn: (input: {
    walletAddress: Address;
    signMessage: (message: string) => Promise<Hex>;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SanitisedSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>("unknown");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await fetchAuthSession();
    if (!result.ok) {
      setStatus("error");
      setError(result.message);
      return;
    }
    if (!result.data) {
      setSession(null);
      setStatus("unauthenticated");
      setError(null);
      return;
    }
    setSession(result.data);
    setStatus("authenticated");
    setError(null);
  }, []);

  const signIn = useCallback<AuthContextValue["signIn"]>(async ({ walletAddress, signMessage }) => {
    setError(null);
    setStatus("unknown");
    const challenge = await requestAuthChallenge(walletAddress);
    if (!challenge.ok) {
      setStatus("error");
      setError(challenge.message);
      throw new Error(challenge.message);
    }
    let signature: Hex;
    try {
      signature = await signMessage(challenge.data.message);
    } catch (cause) {
      setStatus("unauthenticated");
      const message =
        cause instanceof Error ? cause.message : "The wallet refused to sign the message.";
      setError(message);
      throw new Error(message);
    }
    const verify = await verifyAuthSignature({
      walletAddress,
      challengeId: challenge.data.id,
      signature,
    });
    if (!verify.ok) {
      setStatus("error");
      setError(verify.message);
      throw new Error(verify.message);
    }
    setSession(verify.data);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    await logoutAuth();
    setSession(null);
    setStatus("unauthenticated");
    setError(null);
  }, []);

  // Fetch the current session on mount. The `useEffect` lint rule
  // discourages setState in effects, but here the effect is the *only*
  // appropriate place to read browser-cookie-backed state on first render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, error, refresh, signIn, signOut }),
    [status, session, error, refresh, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/**
 * Helper: produce a `signMessage` from the injected EIP-1193 provider.
 * Returns null when no provider is present, so the caller can show a
 * "wallet not detected" error.
 *
 * The address parameter is required for EIP-191 personal_sign to specify
 * which account should sign the message. If not provided, the wallet
 * may reject the signing request.
 */
export function useInjectedSignMessage(address?: Address | null):
  | ((message: string) => Promise<Hex>)
  | null {
  const provider = typeof window === "undefined" ? null : getInjectedProvider();
  if (!provider) return null;
  return async (message: string) => {
    if (!address) {
      throw new Error("Wallet address is required for signing.");
    }
    const result = await provider.request({
      method: "personal_sign",
      params: [message, address],
    });
    if (typeof result !== "string") {
      throw new Error("The wallet returned a non-string signature.");
    }
    return result as Hex;
  };
}
