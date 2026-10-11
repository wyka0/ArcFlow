/**
 * Server-side authentication and ownership for AgentPay.
 *
 * Public entry point for route handlers. Browser code MUST NOT import from
 * this module; the architecture test enforces that contract.
 */
export {
  createSessionForWallet,
  generateSessionId,
  getAuthenticatedWallet,
  getSessionFromRequest,
  isProduction,
  requireAuthenticatedSession,
  revokeSessionFromRequest,
  sanitiseSession,
  type AuthenticatedSessionResult,
  type SanitisedSessionInfo,
} from "./session";
export {
  readSessionIdFromCookieHeader,
  serializeClearSessionCookie,
  serializeSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "./cookie";
export { isEvmAddress, verifyAuthSignature } from "./verify";
export {
  AUTH_MESSAGE_DISCLAIMER,
  AUTH_MESSAGE_HEADER,
  buildAuthMessage,
} from "./challenge";
export { generateNonce } from "./nonce";
export {
  createInMemoryChallengeStore,
  getChallengeStore,
  setChallengeStoreForTesting,
  type AuthChallenge,
  type ChallengeStore,
  type CreateChallengeInput,
} from "./challenge-store";
export { getAuthSessionRepository, hasDurableAuth, setAuthSessionRepositoryForTesting } from "./factory";
export { createInMemoryAuthSessionRepository } from "./repository-memory";
export {
  checkResourceOwnership,
  getOptionalWallet,
  ownershipFor,
  walletOwns,
  type OwnershipCheck,
} from "./ownership";
export type { AuthenticatedSession, AuthPersistenceDescriptor, AuthSessionRepository } from "./repository";
