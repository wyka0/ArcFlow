import { randomBytes } from "node:crypto";

import { getAddress, type Address } from "viem";

import {
  readSessionIdFromCookieHeader,
  SESSION_TTL_SECONDS,
} from "./cookie";
import { getAuthSessionRepository } from "./factory";
import type { AuthenticatedSession } from "./repository";

/**
 * Server-side authentication: the only API a route handler needs to enforce
 * identity and ownership.
 *
 * The contract is small and intentional:
 *
 *   requireAuthenticatedSession(request) -> { kind: "ok", session }   // 200 path
 *   requireAuthenticatedSession(request) -> { kind: "missing" }        // 401
 *
 * The `request` is the standard Web Fetch `Request` passed to Next.js route
 * handlers. We do not depend on Next's `cookies()` helper because the route
 * handler already has the `Cookie` header on the request.
 *
 * The server session is the single source of truth for the authenticated
 * wallet. The browser is never trusted for identity.
 */

export type AuthenticatedSessionResult =
  | { kind: "ok"; session: AuthenticatedSession }
  | { kind: "missing"; reason: "no_cookie" | "invalid_session" | "expired_session" };

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Build a new opaque session id. Cryptographically random; not derived. */
export function generateSessionId(): string {
  return `sess_${randomBytes(24).toString("hex")}`;
}

/** Read the request cookie and resolve it to an active session, if any. */
export async function getSessionFromRequest(request: Request): Promise<AuthenticatedSession | null> {
  const cookieHeader = request.headers.get("cookie");
  const id = readSessionIdFromCookieHeader(cookieHeader);
  if (!id) return null;
  const repo = await getAuthSessionRepository();
  return repo.findById(id);
}

/** Convenience for routes that require a valid session, returning a typed union. */
export async function requireAuthenticatedSession(request: Request): Promise<AuthenticatedSessionResult> {
  const cookieHeader = request.headers.get("cookie");
  const id = readSessionIdFromCookieHeader(cookieHeader);
  if (!id) return { kind: "missing", reason: "no_cookie" };
  const repo = await getAuthSessionRepository();
  const session = await repo.findById(id);
  if (!session) {
    return { kind: "missing", reason: "invalid_session" };
  }
  return { kind: "ok", session };
}

/**
 * Issue a new authenticated session, persist it, and return the cookie value
 * the route handler must send back to the client.
 */
export async function createSessionForWallet(walletAddress: Address): Promise<{
  session: AuthenticatedSession;
}> {
  const repo = await getAuthSessionRepository();
  const now = new Date();
  const session: AuthenticatedSession = {
    id: generateSessionId(),
    // EIP-55 checksummed canonical form.
    walletAddress: getAddress(walletAddress),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
  await repo.create(session);
  return { session };
}

/** Revoke the session whose id is in the request cookie, if any. */
export async function revokeSessionFromRequest(request: Request): Promise<boolean> {
  const cookieHeader = request.headers.get("cookie");
  const id = readSessionIdFromCookieHeader(cookieHeader);
  if (!id) return false;
  const repo = await getAuthSessionRepository();
  return repo.revoke(id);
}

/**
 * Read the request, resolve the session, and answer the question every
 * protected route eventually asks: "who owns this resource?".
 *
 * Returns the normalised (checksummed) wallet address, or null if the request
 * is unauthenticated. Routes that allow unauthenticated demo access should
 * branch on the boolean; routes that require auth should call
 * `requireAuthenticatedSession` instead.
 */
export async function getAuthenticatedWallet(request: Request): Promise<Address | null> {
  const session = await getSessionFromRequest(request);
  if (!session) return null;
  return session.walletAddress;
}

/**
 * Standardised sanitised session info returned to the browser.
 *
 * The cookie value, internal session id, and the full session record are
 * NEVER returned. The browser only learns the wallet address.
 */
export interface SanitisedSessionInfo {
  authenticated: true;
  walletAddress: Address;
  createdAt: string;
  expiresAt: string;
}

export function sanitiseSession(session: AuthenticatedSession): SanitisedSessionInfo {
  return {
    authenticated: true,
    walletAddress: session.walletAddress,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}
