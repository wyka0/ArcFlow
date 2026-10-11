/**
 * Hardened request body reader.
 *
 * Every public POST route goes through `readJsonBody()`. The reader:
 *  - Enforces a content-type of `application/json`.
 *  - Caps the body size at the policy value.
 *  - Returns a discriminated result so the caller can return the right
 *    HTTP status code without leaking implementation details.
 *  - Never echoes the raw body in the error response.
 *
 * The size cap defaults to 16 KB. Routes that legitimately need more
 * (e.g. service `input` payloads) can pass a larger value but the
 * limit must still be explicit.
 */

import { logSecurityEvent } from "./logger";
import { hashKey } from "./rate-limit";

export type ReadJsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; code: BodyErrorCode; message: string; status: number };

export type BodyErrorCode =
  | "INVALID_CONTENT_TYPE"
  | "BODY_TOO_LARGE"
  | "EMPTY_BODY"
  | "INVALID_JSON"
  | "NOT_AN_OBJECT";

export interface ReadJsonBodyOptions {
  /** Maximum body size in bytes. Default 16 KB. */
  maxBytes?: number;
  /** Required content-type. Default `application/json`. */
  contentType?: string;
  /** Identity key for logging oversized bodies. */
  identityKey?: string;
}

const DEFAULT_MAX_BYTES = 16 * 1024;

function contentTypeMatches(actual: string, expected: string): boolean {
  // Tolerate `application/json; charset=utf-8` and similar.
  return actual.toLowerCase().split(";")[0]?.trim() === expected.toLowerCase();
}

export async function readJsonBody(
  request: Request,
  options: ReadJsonBodyOptions = {},
): Promise<ReadJsonBodyResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const expectedType = options.contentType ?? "application/json";

  // Content-type guard. We require application/json; we never accept
  // form-encoded or multipart bodies for AgentPay's typed API.
  const rawType = request.headers.get("content-type");
  if (!rawType || !contentTypeMatches(rawType, expectedType)) {
    return {
      ok: false,
      code: "INVALID_CONTENT_TYPE",
      message: "Content-Type must be application/json.",
      status: 415,
    };
  }

  // Cap body size using content-length first (fast path) then a streaming
  // cap (defensive).
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number.parseInt(contentLength, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      logSecurityEvent({
        kind: "BODY_TOO_LARGE",
        keyHash: options.identityKey ? hashKey(options.identityKey) : undefined,
        value: declared,
      });
      return {
        ok: false,
        code: "BODY_TOO_LARGE",
        message: "Request body exceeds the allowed size.",
        status: 413,
      };
    }
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, code: "INVALID_JSON", message: "Request body could not be read.", status: 400 };
  }

  if (raw.length === 0) {
    return { ok: false, code: "EMPTY_BODY", message: "Request body is required.", status: 400 };
  }

  if (raw.length > maxBytes) {
    logSecurityEvent({
      kind: "BODY_TOO_LARGE",
      keyHash: options.identityKey ? hashKey(options.identityKey) : undefined,
      value: raw.length,
    });
    return {
      ok: false,
      code: "BODY_TOO_LARGE",
      message: "Request body exceeds the allowed size.",
      status: 413,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: "INVALID_JSON", message: "Malformed JSON body.", status: 400 };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    // `null` JSON or array/non-object bodies are treated as malformed JSON
    // for backwards compatibility with the existing error contract.
    return { ok: false, code: "INVALID_JSON", message: "Request body must be a JSON object.", status: 400 };
  }

  return { ok: true, body: parsed };
}

/** Helper: extract a string field with a max length. */
export function readStringField(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; code: string; message: string; status: number } {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, code: "INVALID_FIELD", message: `${field} is required.`, status: 400 };
  }
  if (value.length > maxLength) {
    return {
      ok: false,
      code: "FIELD_TOO_LARGE",
      message: `${field} exceeds the allowed length.`,
      status: 413,
    };
  }
  return { ok: true, value };
}

/** Validate that a string looks like a 0x transaction hash. */
export async function readTxHashField(
  body: Record<string, unknown>,
  field: string,
): Promise<
  { ok: true; value: string } | { ok: false; code: string; message: string; status: number }
> {
  const result = readStringField(body, field, 80);
  if (!result.ok) return result;
  // Delegate to the canonical transaction-hash helper so the
  // shape never diverges from the chain-validator.
  const { isTransactionHash } = await import("@/lib/arc/payment");
  if (!isTransactionHash(result.value)) {
    return {
      ok: false,
      code: "MALFORMED_TX_HASH",
      message: `${field} must be a 0x-prefixed 64-character hex string.`,
      status: 400,
    };
  }
  return result;
}

/** Validate that a string looks like an opaque AgentPay id. */
export function readIdField(
  body: Record<string, unknown>,
  field: string,
): { ok: true; value: string } | { ok: false; code: string; message: string; status: number } {
  const result = readStringField(body, field, 128);
  if (!result.ok) return result;
  // AgentPay ids are random hex; reject anything that would otherwise
  // be dangerous in a URL.
  if (!/^[A-Za-z0-9_-]+$/.test(result.value)) {
    return {
      ok: false,
      code: "MALFORMED_ID",
      message: `${field} contains illegal characters.`,
      status: 400,
    };
  }
  return result;
}

/** Extract an object field (for service input parameters). */
export function readObjectField(
  body: Record<string, unknown>,
  field: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; code: string; message: string; status: number } {
  const value = body[field];
  if (value === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      code: "INVALID_FIELD",
      message: `${field} must be an object.`,
      status: 400,
    };
  }
  return { ok: true, value: value as Record<string, unknown> };
}
