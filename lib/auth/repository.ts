import type { Address } from "viem";

/**
 * A server-issued authentication session.
 *
 * The session is the only authority for "who is making this request". The
 * browser never holds the authority — only the opaque session id in an
 * HttpOnly cookie. Every protected API route resolves the session through
 * the repository and uses `walletAddress` as the canonical identity.
 */
export interface AuthenticatedSession {
  /** Random opaque session id (not a JWT, not a wallet signature). */
  id: string;
  /** Lowercased, EIP-55-normalised wallet address the session is bound to. */
  walletAddress: Address;
  /** When the session was created. */
  createdAt: string;
  /** When the session must no longer be accepted. */
  expiresAt: string;
}

export interface AuthPersistenceDescriptor {
  kind: "in-memory" | "postgres";
  durable: boolean;
  label: string;
  note: string;
}

export interface AuthSessionRepository {
  readonly persistence: AuthPersistenceDescriptor;

  /** Idempotent. Returns the created session. */
  create(session: AuthenticatedSession): Promise<AuthenticatedSession>;

  /** Returns the active session, or null if missing/expired/revoked. */
  findById(id: string): Promise<AuthenticatedSession | null>;

  /** Returns the most recent active session for a wallet, or null. */
  findByWallet(walletAddress: Address): Promise<AuthenticatedSession | null>;

  /** Revoke a specific session. Returns true when something was removed. */
  revoke(id: string): Promise<boolean>;

  /** Test seam. */
  clearAll(): Promise<void>;
}

export const IN_MEMORY_AUTH_PERSISTENCE: AuthPersistenceDescriptor = {
  kind: "in-memory",
  durable: false,
  label: "AUTH SESSIONS (IN-MEMORY)",
  note: "Development fallback. Sessions are lost on restart; set DATABASE_URL for durable sessions.",
};

export const POSTGRES_AUTH_PERSISTENCE: AuthPersistenceDescriptor = {
  kind: "postgres",
  durable: true,
  label: "AUTH SESSIONS (POSTGRES)",
  note: "Durable server-side sessions outside browser control.",
};
