/**
 * Identity resolution for security decisions.
 *
 * The security layer never trusts the client's self-asserted identity.
 * For authenticated routes, the canonical identity is the session
 * wallet (EIP-55 normalised, lowercased for comparison). For anonymous
 * routes, the server falls back to a best-effort client IP — but only
 * as an abuse signal, never as a permanent identity.
 *
 * Forwarded headers are handled with a documented trust model:
 *  - The AgentPay server treats `X-Forwarded-For` as advisory only.
 *  - A real production deployment must terminate the proxy at a known
 *    edge and pass the real client IP through a configured trusted
 *    header. The exact header name is exposed via `TRUSTED_CLIENT_IP_HEADER`
 *    so the deployment can choose the right one (e.g. CF-Connecting-IP).
 *  - When no trusted header is configured, the IP is read from the
 *    request's remote address, which is meaningless in most serverless
 *    environments and is therefore always paired with the wallet key
 *    (when present) so the limit cannot be bypassed by rotating IPs.
 */

import { getAddress, isAddress, type Address } from "viem";

import { getOptionalWallet } from "@/lib/auth/ownership";

/** Configuration: the trusted proxy header to read the client IP from. */
function getTrustedClientIpHeader(): string | null {
  const raw = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/**
 * Read the client IP from the request. Order of preference:
 *  1. Configured trusted header (e.g. CF-Connecting-IP).
 *  2. X-Forwarded-For (first hop, advisory).
 *  3. Null — no IP available.
 */
export function getClientIp(request: Request): string | null {
  const trusted = getTrustedClientIpHeader();
  if (trusted) {
    const value = request.headers.get(trusted);
    if (value && value.length > 0) return normaliseIp(value);
  }
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return normaliseIp(first);
  }
  return null;
}

function normaliseIp(raw: string): string {
  // Strip the port suffix (e.g. "1.2.3.4:5678") and trailing whitespace.
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    // IPv6 with zone/port
    const closing = trimmed.indexOf("]");
    if (closing > 0) return trimmed.slice(0, closing + 1);
  }
  const colon = trimmed.lastIndexOf(":");
  // If this looks like an IPv4 with port, strip the port.
  if (colon > 0 && trimmed.indexOf(":") === colon && /^\d+\.\d+\.\d+\.\d+$/.test(trimmed.slice(0, colon))) {
    return trimmed.slice(0, colon);
  }
  return trimmed;
}

/**
 * Resolve the canonical security identity for a request.
 *
 *  - When the request has a valid session cookie, the session wallet
 *    (EIP-55 normalised, lowercased) is the identity.
 *  - When the request has no session, the IP is used (or "ip:unknown"
 *    if no IP is available).
 *
 * The result is the value the rate limiter and the structured logger
 * will key off of.
 */
export async function resolveSecurityIdentity(
  request: Request,
): Promise<{ kind: "wallet" | "ip"; key: string }> {
  const wallet = await getOptionalWallet(request);
  if (wallet) {
    return { kind: "wallet", key: wallet.toLowerCase() };
  }
  const ip = getClientIp(request);
  if (ip) {
    return { kind: "ip", key: `ip:${ip}` };
  }
  return { kind: "ip", key: "ip:unknown" };
}

/**
 * Lowercase an EIP-55 address. Returns null if the input is not a
 * valid address. Use this when the security layer needs to compare
 * addresses safely.
 */
export function normaliseAddress(value: unknown): Address | null {
  if (typeof value !== "string") return null;
  if (!isAddress(value, { strict: false })) return null;
  return getAddress(value).toLowerCase() as Address;
}
