/**
 * Server-side security boundary for AgentPay.
 *
 * Public entry point for the security module. Route handlers, the
 * Next.js config, and the trust boundary tests import from here. The
 * browser MUST NOT import this module — the architecture test enforces
 * that contract.
 */

export {
  consumeRateLimit,
  getPolicy,
  getRateLimitStore,
  hashKey,
  POLICIES,
  setRateLimitStoreForTesting,
  InMemoryRateLimitStore,
  type ConsumeOptions,
  type PolicyName,
  type RateLimitDecision,
  type RateLimitPolicy,
  type RateLimitStore,
} from "./rate-limit";

export {
  buildSecurityHeaders,
  applySecurityHeaders,
} from "./headers";

export {
  readJsonBody,
  readStringField,
  readTxHashField,
  readIdField,
  type BodyErrorCode,
  type ReadJsonBodyOptions,
  type ReadJsonBodyResult,
} from "./request-body";

export {
  validateRequestOrigin,
  getCanonicalOrigin,
  type OriginDecision,
} from "./origin";

export {
  getClientIp,
  resolveSecurityIdentity,
  normaliseAddress,
} from "./identity";

export {
  logSecurityEvent,
  setSecurityLoggerSinkForTesting,
  type SecurityEvent,
  type SecurityEventKind,
  type SecurityEventSink,
} from "./logger";

export {
  resolveProductionRecipient,
  type ProductionRecipientResolution,
  type RecipientResolution,
} from "./recipients";

export {
  getServerRuntime,
  setServerRuntimeForTesting,
  resetServerRuntimeCache,
  type ServerRuntime,
} from "./env";

export {
  guardJsonRequest,
  guardReadRequest,
  type GuardOptions,
  type GuardResult,
} from "./guard";
