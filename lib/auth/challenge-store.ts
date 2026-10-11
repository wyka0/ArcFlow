import type { Address } from "viem";

import { buildAuthMessage } from "./challenge";
import { generateNonce } from "./nonce";

/**
 * A short-lived authentication challenge.
 *
 * Each challenge is single-use: the moment `/api/auth/verify` consumes one,
 * the server deletes it. The challenge also expires after a few minutes so a
 * forgotten challenge cannot be replayed even if its id leaks.
 *
 * Challenges are intentionally NOT persisted to PostgreSQL. They live in
 * process memory because:
 *   - they are bound to a single authentication attempt
 *   - they are not user-visible state
 *   - a server restart forces a re-auth anyway, which is acceptable
 */
export interface AuthChallenge {
  /** Random challenge id, also embedded inside the signed message. */
  id: string;
  /** Lower-cased wallet address this challenge is bound to. */
  walletAddress: Address;
  /** Hex random nonce embedded inside the signed message. */
  nonce: `0x${string}`;
  /** EIP-191 message the wallet must sign. */
  message: string;
  /** ISO timestamp the challenge was issued. */
  issuedAt: string;
  /** ISO timestamp after which the challenge is invalid. */
  expiresAt: string;
}

export interface CreateChallengeInput {
  walletAddress: Address;
  /** Wall-clock injection point (test seam). */
  now?: Date;
  /** Default 5 minutes. */
  ttlMs?: number;
  /** Origin embedded in the message, e.g. "https://app.agentpay.example". */
  origin: string;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface ChallengeStore {
  create(input: CreateChallengeInput): AuthChallenge;
  /** Returns and removes the challenge atomically. Returns null if missing/expired/wrong-wallet. */
  consume(id: string, walletAddress: Address, now?: Date): AuthChallenge | null;
  /** Peek at a challenge without consuming it. Used for diagnostics only. */
  peek(id: string): AuthChallenge | null;
  clearAll(): void;
}

export function createInMemoryChallengeStore(): ChallengeStore {
  const challenges = new Map<string, AuthChallenge>();

  function isActive(challenge: AuthChallenge, now: Date): boolean {
    return new Date(challenge.expiresAt) > now;
  }

  return {
    create(input) {
      const now = input.now ?? new Date();
      const issuedAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + (input.ttlMs ?? DEFAULT_TTL_MS)).toISOString();
      const nonce = generateNonce();
      // Build the message last so it reflects the actual id, nonce, and timing.
      // The id is generated here so that the message contains a stable, unique
      // identifier the server can use as a key.
      const id = `chg_${randomHex(16)}`;
      // The canonical message builder is the single source of truth for the
      // message body; both the issue path and the verify path must agree.
      const message = buildAuthMessage({
        walletAddress: input.walletAddress,
        nonce,
        issuedAt,
        expiresAt,
        origin: input.origin,
        challengeId: id,
      });
      const challenge: AuthChallenge = {
        id,
        walletAddress: input.walletAddress,
        nonce,
        message,
        issuedAt,
        expiresAt,
      };
      challenges.set(id, challenge);
      return challenge;
    },

    consume(id, walletAddress, now) {
      const challenge = challenges.get(id);
      if (!challenge) return null;
      challenges.delete(id); // Always delete to enforce single-use.
      if (!isActive(challenge, now ?? new Date())) return null;
      if (challenge.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) return null;
      return challenge;
    },

    peek(id) {
      const challenge = challenges.get(id);
      if (!challenge) return null;
      if (!isActive(challenge, new Date())) {
        challenges.delete(id);
        return null;
      }
      return challenge;
    },

    clearAll() {
      challenges.clear();
    },
  };
}

function randomHex(bytes: number): string {
  // Avoids importing node:crypto at module top — keeps this module a pure
  // utility. The Node-only `randomBytes` is imported lazily.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
  return randomBytes(bytes).toString("hex");
}

let storeSingleton: ChallengeStore | null = null;
export function getChallengeStore(): ChallengeStore {
  if (!storeSingleton) {
    storeSingleton = createInMemoryChallengeStore();
  }
  return storeSingleton;
}

export function setChallengeStoreForTesting(store: ChallengeStore | null): void {
  storeSingleton = store;
}
