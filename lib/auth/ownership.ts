import type { Address } from "viem";

import type { EvmAddress } from "@/types";

import {
  getSessionFromRequest,
  requireAuthenticatedSession,
  type AuthenticatedSessionResult,
} from "./session";

/**
 * Ownership helpers used by protected API routes.
 *
 * Every helper answers a single, well-defined question. Routes call one
 * helper and either:
 *   - branch on the result (auth optional)
 *   - return a 401/403 when the result is "not allowed"
 *
 * Routes never re-implement wallet comparison logic.
 */

export type OwnershipCheck =
  | { ok: true; wallet: Address | null }
  | { ok: false; status: 401 | 403; code: string; message: string };

/** True if `actual` is `null` (anonymous resource) or matches `expected`. */
export function walletOwns(expected: Address | null, actual: EvmAddress | null | undefined): boolean {
  if (actual === null || actual === undefined) return true; // anonymous
  if (expected === null) return false; // unauthenticated caller, owned resource
  return actual.toLowerCase() === expected.toLowerCase();
}

/**
 * Check ownership for a payment intent or trusted payment.
 *
 *  - If the resource is anonymous (no owner), any caller is allowed.
 *  - If the resource is owned, the caller MUST be authenticated AND the
 *    session wallet MUST match the owner.
 *  - If the caller is unauthenticated, anonymous resources are allowed but
 *    owned resources are rejected (401 to encourage sign-in).
 */
export function checkResourceOwnership(
  owner: EvmAddress | null | undefined,
  session: AuthenticatedSessionResult,
): OwnershipCheck {
  if (owner === null || owner === undefined) {
    // Anonymous resource: pass through the caller's wallet so the caller
    // can attach it to a downstream state change if needed.
    if (session.kind === "ok") return { ok: true, wallet: session.session.walletAddress };
    return { ok: true, wallet: null };
  }
  if (session.kind === "missing") {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "This resource is owned by a wallet. Sign in to access it.",
    };
  }
  if (owner.toLowerCase() !== session.session.walletAddress.toLowerCase()) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "You are not authorised to access this resource.",
    };
  }
  return { ok: true, wallet: session.session.walletAddress };
}

/**
 * Convenience: pull the session and run `checkResourceOwnership` in one
 * call for the common case of an intent, payment, or request lookup.
 */
export async function ownershipFor(
  request: Request,
  resource: { ownerWalletAddress?: EvmAddress | null } | null,
): Promise<OwnershipCheck> {
  if (!resource) {
    // Not found is reported as 404 by the caller; this helper is a no-op.
    return { ok: true, wallet: null };
  }
  const session = await requireAuthenticatedSession(request);
  return checkResourceOwnership(resource.ownerWalletAddress ?? null, session);
}

/** Return the authenticated wallet, or `null` if unauthenticated. */
export async function getOptionalWallet(request: Request): Promise<Address | null> {
  const session = await getSessionFromRequest(request);
  return session?.walletAddress ?? null;
}
