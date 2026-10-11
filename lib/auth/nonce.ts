import { randomBytes } from "node:crypto";

/**
 * Cryptographically-secure random nonce generator.
 *
 * Each challenge gets a 32-byte random nonce. We never derive nonces from
 * timestamps, counters, wallet addresses, or any other deterministic source,
 * because that would let an attacker predict challenges.
 *
 * Returns the hex string with a 0x prefix for ergonomics.
 */
export function generateNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}
