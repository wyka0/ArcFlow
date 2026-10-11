/**
 * Browser-side auth client.
 *
 * This module only speaks HTTP. It never holds the session id, never reads
 * cookies, and never treats a local value as authoritative. The server
 * remains the single source of truth.
 */
export interface AuthChallenge {
  id: string;
  message: string;
  issuedAt: string;
  expiresAt: string;
}

export interface SanitisedSession {
  authenticated: true;
  walletAddress: `0x${string}`;
  createdAt: string;
  expiresAt: string;
}

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorFrom(response: Response, fallback: { code: string; message: string }): { code: string; message: string } {
  return fallback;
}

export async function requestAuthChallenge(walletAddress: `0x${string}`): Promise<AuthResult<AuthChallenge>> {
  const response = await fetch("/api/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress }),
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await readJson(response)) as { error?: { code: string; message: string } } | null;
    return {
      ok: false,
      ...errorFrom(response, {
        code: body?.error?.code ?? "CHALLENGE_FAILED",
        message: body?.error?.message ?? "Could not request an authentication challenge.",
      }),
    };
  }
  const body = (await response.json()) as { challenge: AuthChallenge };
  return { ok: true, data: body.challenge };
}

export async function verifyAuthSignature(input: {
  walletAddress: `0x${string}`;
  challengeId: string;
  signature: `0x${string}`;
}): Promise<AuthResult<SanitisedSession>> {
  const response = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await readJson(response)) as { error?: { code: string; message: string } } | null;
    return {
      ok: false,
      ...errorFrom(response, {
        code: body?.error?.code ?? "VERIFY_FAILED",
        message: body?.error?.message ?? "Could not verify the authentication signature.",
      }),
    };
  }
  const body = (await response.json()) as { session: SanitisedSession };
  return { ok: true, data: body.session };
}

export async function fetchAuthSession(): Promise<AuthResult<SanitisedSession | null>> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    return { ok: false, code: "SESSION_FAILED", message: "Could not read the session." };
  }
  const body = (await response.json()) as { authenticated: boolean; session?: SanitisedSession };
  if (!body.authenticated || !body.session) {
    return { ok: true, data: null };
  }
  return { ok: true, data: body.session };
}

export async function logoutAuth(): Promise<AuthResult<true>> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    return { ok: false, code: "LOGOUT_FAILED", message: "Could not sign out." };
  }
  return { ok: true, data: true };
}
