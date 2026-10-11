import type { Address } from "viem";

/**
 * Build the EIP-191 personal_sign message a wallet must sign to authenticate
 * with AgentPay.
 *
 * The message explicitly states:
 *   - it is an authentication/login signature
 *   - it does NOT authorize a blockchain transaction
 *   - it does NOT transfer funds
 *   - it is bound to a server-issued nonce, challenge id, and an expiration
 *
 * The wallet UI will display this exact text, so the user sees clear wording
 * before signing. The single source of truth for the message body lives in
 * this file; `lib/auth/challenge-store.ts` and `app/api/auth/challenge/route.ts`
 * both consume this function so the issued and the verified text are
 * guaranteed identical.
 *
 * The origin is supplied by the route handler (the request host), not hardcoded,
 * so the message reflects the actual application the user is signing into.
 */
export function buildAuthMessage(input: {
  walletAddress: Address;
  nonce: `0x${string}`;
  issuedAt: string;
  expiresAt: string;
  origin: string;
  /** Server-issued challenge id; embedded in the message and bound to the wallet. */
  challengeId: string;
}): string {
  const lines = [
    "Sign in to AgentPay",
    "",
    "This signature proves wallet ownership for authentication.",
    "It does NOT authorize a blockchain transaction.",
    "It does NOT transfer funds.",
    "",
    `Wallet: ${input.walletAddress}`,
    `Origin: ${input.origin}`,
    `Issued: ${input.issuedAt}`,
    `Expires: ${input.expiresAt}`,
    `Nonce: ${input.nonce}`,
    `Challenge: ${input.challengeId}`,
  ];
  return lines.join("\n");
}

/** Parse the human-readable header line out of a message (for tests). */
export const AUTH_MESSAGE_HEADER = "Sign in to AgentPay";

/** The statement the user sees, surfaced for documentation and tests. */
export const AUTH_MESSAGE_DISCLAIMER =
  "This signature does not authorize a blockchain transaction or transfer funds.";
