import type { Address } from "viem";

import {
  IN_MEMORY_AUTH_PERSISTENCE,
  type AuthSessionRepository,
  type AuthenticatedSession,
} from "./repository";

/**
 * In-memory auth session repository.
 *
 * Used for tests and as a development fallback when no `DATABASE_URL` is
 * configured. Enforces the same invariants as the durable adapter:
 *  - sessions are looked up by id only
 *  - expired sessions are treated as missing (so callers can `findById`
 *    without separately checking the clock)
 *  - revocation is permanent for the lifetime of the process
 */
export function createInMemoryAuthSessionRepository(): AuthSessionRepository {
  const sessions = new Map<string, AuthenticatedSession>();

  function isActive(session: AuthenticatedSession, now: Date): boolean {
    return new Date(session.expiresAt) > now;
  }

  return {
    persistence: IN_MEMORY_AUTH_PERSISTENCE,

    async create(session) {
      sessions.set(session.id, session);
      return session;
    },

    async findById(id) {
      const session = sessions.get(id);
      if (!session) return null;
      if (!isActive(session, new Date())) {
        sessions.delete(id);
        return null;
      }
      return session;
    },

    async findByWallet(walletAddress: Address) {
      const target = walletAddress.toLowerCase();
      const now = new Date();
      let best: AuthenticatedSession | null = null;
      for (const session of sessions.values()) {
        if (session.walletAddress.toLowerCase() !== target) continue;
        if (!isActive(session, now)) continue;
        if (!best || session.createdAt > best.createdAt) {
          best = session;
        }
      }
      return best;
    },

    async revoke(id) {
      return sessions.delete(id);
    },

    async clearAll() {
      sessions.clear();
    },
  };
}
