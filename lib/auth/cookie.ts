/**
 * Server-side helpers for the AgentPay auth cookie.
 *
 * The cookie stores ONLY the opaque session id. It is HttpOnly, SameSite=Lax,
 * and bound to the root path. Browsers cannot read it; JavaScript on the
 * page cannot read it; cross-site form posts cannot ride it.
 *
 * The cookie name is fixed. There is no per-user branching in the cookie
 * itself; the server resolves the session id to a wallet through the
 * session repository.
 */
export const SESSION_COOKIE_NAME = "agentpay_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export interface CookieOptions {
  maxAge: number;
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
}

export function buildSessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    maxAge: SESSION_TTL_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProduction,
  };
}

/** Encode a Set-Cookie header for the session cookie. */
export function serializeSessionCookie(value: string, isProduction: boolean): string {
  const opts = buildSessionCookieOptions(isProduction);
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    `Max-Age=${opts.maxAge}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${opts.sameSite.charAt(0).toUpperCase()}${opts.sameSite.slice(1)}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Encode a Set-Cookie header that clears the session cookie. */
export function serializeClearSessionCookie(isProduction: boolean): string {
  // Browsers ignore Max-Age=0 and accept a past date for clearing.
  const opts = buildSessionCookieOptions(isProduction);
  void opts;
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    isProduction ? "Secure" : null,
  ]
    .filter((part): part is string => part !== null)
    .join("; ");
}

/** Pull the session id out of a Cookie header. Returns null if missing. */
export function readSessionIdFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq);
    if (name === SESSION_COOKIE_NAME) {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}
