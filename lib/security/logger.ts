/**
 * Structured security event logger.
 *
 * Single channel for security-relevant events. The logger:
 *  - Writes a single line of JSON per event to stdout (or any sink).
 *  - NEVER logs private keys, signatures, session cookies, full auth
 *    headers, or raw request bodies.
 *  - Allows wallet addresses ONLY when the event genuinely needs them
 *    (e.g. AUTH_VERIFY_FAILURE). By default, callers should use the
 *    opaque `keyHash` helper from the rate-limit module instead.
 *  - Is fail-safe: the logger never throws.
 *
 * Events are addressed by a small enum of `kind` values. Adding a new
 * event type is a single line — but every entry must be on the
 * documented allow-list.
 */

import { getServerRuntime, type ServerRuntime } from "./env";

export type SecurityEventKind =
  | "AUTH_CHALLENGE_CREATED"
  | "AUTH_VERIFY_SUCCESS"
  | "AUTH_VERIFY_FAILURE"
  | "AUTH_SESSION_CREATED"
  | "AUTH_LOGOUT"
  | "RATE_LIMITED"
  | "RATE_LIMITER_UNAVAILABLE"
  | "PAYMENT_INTENT_REJECTED"
  | "PAYMENT_VERIFY_REJECTED"
  | "PAYMENT_VERIFIED"
  | "SERVICE_REQUEST_REJECTED"
  | "SERVICE_REQUEST_RECONCILED"
  | "OWNERSHIP_REJECTED"
  | "SERVICE_FULFILLMENT_REJECTED"
  | "CONFIGURATION_ERROR"
  | "EXTERNAL_PROVIDER_ERROR"
  | "BODY_TOO_LARGE"
  | "ORIGIN_REJECTED"
  | "RECIPIENT_REJECTED"
  | "AGENT_REGISTERED"
  | "AGENT_SERVICE_REQUEST_CREATED"
  | "AGENT_SERVICE_REQUEST_IDEMPOTENT"
  | "DEMO_PAYMENT_COMPLETED";

export interface SecurityEvent {
  kind: SecurityEventKind;
  /** Stable opaque key for the offending identity (e.g. hashed wallet). */
  keyHash?: string;
  /** Optional policy name (rate limit). */
  policy?: string;
  /** Optional human-safe context. Never includes PII, secrets, or signatures. */
  detail?: string;
  /** Optional numeric context (e.g. body size, status code). */
  value?: number;
  /** Optional error message; only included when the message is itself safe. */
  error?: string;
  /** Server runtime snapshot. */
  runtime?: ServerRuntime;
}

export type SecurityEventSink = (event: SecurityEvent & { timestamp: string }) => void;

/**
 * Default sink: writes a structured JSON line to stdout. In production
 * this is what gets shipped to log aggregation.
 */
const defaultSink: SecurityEventSink = (event) => {
  try {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  } catch {
    // Never let a logging failure propagate.
  }
};

let activeSink: SecurityEventSink = defaultSink;

/** Test seam — never call from production code. */
export function setSecurityLoggerSinkForTesting(sink: SecurityEventSink | null): void {
  activeSink = sink ?? defaultSink;
}

const SENSITIVE_MARKERS = [
  "privateKey",
  "private key",
  "seed phrase",
  "mnemonic",
  "signature",
  "Set-Cookie",
  "cookie:",
  "authorization:",
  "Bearer ",
];

function scrubString(input: string | undefined): string | undefined {
  if (!input) return input;
  const lower = input.toLowerCase();
  for (const marker of SENSITIVE_MARKERS) {
    if (lower.includes(marker.toLowerCase())) return "[redacted]";
  }
  // Truncate any single string to a sane length so a misconfigured
  // caller cannot dump a 1MB string into a log line.
  return input.length > 200 ? `${input.slice(0, 200)}…` : input;
}

export function logSecurityEvent(event: SecurityEvent): void {
  const safe: SecurityEvent & { timestamp: string } = {
    kind: event.kind,
    keyHash: event.keyHash,
    policy: event.policy,
    detail: scrubString(event.detail),
    value: typeof event.value === "number" ? event.value : undefined,
    error: scrubString(event.error),
    runtime: getServerRuntime(),
    timestamp: new Date().toISOString(),
  };
  try {
    activeSink(safe);
  } catch {
    // Never let a logging failure propagate.
  }
}
