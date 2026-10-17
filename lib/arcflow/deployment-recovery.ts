/**
 * Phase 48.4 (finding F1) — durable unknown-outcome recovery record.
 *
 * When a deployment transaction is submitted but its receipt cannot be
 * confirmed (timeout / RPC failure), the submitted evidence is persisted to
 * browser-local persistence so a page refresh or navigation cannot silently
 * clear the "do not resubmit blindly" guard. The record holds public chain
 * evidence only (a transaction hash, the uncertain step, an optional flow id,
 * and the deployment scope) — never keys, signatures, seeds, or session tokens.
 *
 * Like the payment-history persistence, this is NOT a security boundary: the
 * persisted record is user-owned and tamperable. It provides continuity of
 * evidence across reloads, exactly as lib/payments/storage.ts does for
 * confirmed payments.
 *
 * Storage conventions follow lib/payments/storage.ts: this module never touches
 * `window`. It works against the injected `KeyValueStorage` interface, so SSR
 * and tests use fakes and every storage failure is survivable.
 */

import type { KeyValueStorage } from "../payments/storage";
import { ARC_NETWORKS } from "../arc/network";
import type { DeployStepKey } from "./deploy-flow";

export const DEPLOYMENT_RECOVERY_STORAGE_KEY = "agentpay.arcflow.deployment-recovery.v1";

/** The only schema version this module reads or writes. */
const RECOVERY_RECORD_VERSION = 1;

/** A persisted unknown-outcome record (all addresses normalized lowercase). */
export interface DeploymentRecoveryRecord {
  version: 1;
  /** Wallet account that submitted the uncertain transaction (lowercase). */
  account: `0x${string}`;
  /** Chain the transaction was submitted to. */
  chainId: number;
  /** ArcFlow contract the deployment targeted (lowercase). */
  contractAddress: `0x${string}`;
  /** The submitted transaction whose outcome is unknown. */
  transactionHash: `0x${string}`;
  /** The step whose outcome is unknown. */
  phase: DeployStepKey;
  /** Created flow id, when the create step had already confirmed. */
  flowId: string | null;
  /** Epoch milliseconds — informational only, never used for expiry. */
  createdAt: number;
}

export interface DeploymentRecoveryScope {
  account: string | null;
  chainId: number;
  /** Resolved contract address, or null while deployment is unconfigured. */
  contractAddress: string | null;
}

export type SaveDeploymentRecoveryResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "invalid-input" | "write-failed" };

export type LoadDeploymentRecoveryResult =
  | { status: "restored"; record: DeploymentRecoveryRecord }
  | { status: "none" }
  | { status: "invalid" }
  | { status: "unavailable" };

export type ClearDeploymentRecoveryResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "scope-mismatch" };

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const TX_HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const FLOW_ID_PATTERN = /^[0-9]+$/;
const STEP_KEYS: readonly DeployStepKey[] = ["create", "activate", "approve", "execute"];

/** Known Arc chains only — records scoped to anything else never restore. */
function isKnownArcChainId(chainId: number): boolean {
  return Number.isInteger(chainId) && ARC_NETWORKS.some((network) => network.chainId === chainId);
}

/** Structural validation of an (untrusted) parsed record. */
function isValidRecoveryRecord(value: unknown): value is DeploymentRecoveryRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== RECOVERY_RECORD_VERSION) return false;
  if (typeof record.account !== "string" || !ADDRESS_PATTERN.test(record.account)) return false;
  if (!isKnownArcChainId(record.chainId as number)) return false;
  if (typeof record.contractAddress !== "string" || !ADDRESS_PATTERN.test(record.contractAddress)) return false;
  if (typeof record.transactionHash !== "string" || !TX_HASH_PATTERN.test(record.transactionHash)) return false;
  if (typeof record.phase !== "string" || !STEP_KEYS.includes(record.phase as DeployStepKey)) return false;
  if (record.flowId !== null && (typeof record.flowId !== "string" || !FLOW_ID_PATTERN.test(record.flowId))) return false;
  if (typeof record.createdAt !== "number" || !Number.isFinite(record.createdAt)) return false;
  return true;
}

/** Scope match: same wallet account, same chain, same contract (normalized). */
function scopeMatches(record: DeploymentRecoveryRecord, scope: DeploymentRecoveryScope): boolean {
  if (!scope.account) return false;
  if (!scope.contractAddress) return false;
  return (
    record.account === scope.account.toLowerCase() &&
    record.chainId === scope.chainId &&
    record.contractAddress === scope.contractAddress.toLowerCase()
  );
}

/**
 * Narrow a string to `0x${string}` after the regex pattern above has already
 * validated it. Single, documented cast point for validated values.
 */
function asValidated(value: string): `0x${string}` {
  return value as `0x${string}`;
}

/**
 * Persist the recovery evidence for an unknown transaction outcome.
 *
 * Fail-safe by design: on any failure the record is simply not persisted and
 * the caller's in-memory guard remains the only (weaker) protection — persistence
 * is never allowed to clear or weaken a block.
 */
export function saveDeploymentRecoveryRecord(
  storage: KeyValueStorage | null,
  input: {
    account: string | null;
    chainId: number;
    contractAddress: string | null;
    transactionHash: string;
    phase: DeployStepKey;
    flowId?: bigint | string | null;
  },
): SaveDeploymentRecoveryResult {
  if (!storage) return { ok: false, reason: "unavailable" };
  if (!input.account || !ADDRESS_PATTERN.test(input.account.toLowerCase())) {
    return { ok: false, reason: "invalid-input" };
  }
  if (!isKnownArcChainId(input.chainId)) return { ok: false, reason: "invalid-input" };
  if (!input.contractAddress || !ADDRESS_PATTERN.test(input.contractAddress.toLowerCase())) {
    return { ok: false, reason: "invalid-input" };
  }
  const transactionHash = input.transactionHash.toLowerCase();
  if (!TX_HASH_PATTERN.test(transactionHash)) return { ok: false, reason: "invalid-input" };
  if (!STEP_KEYS.includes(input.phase)) return { ok: false, reason: "invalid-input" };

  const flowId =
    input.flowId === undefined || input.flowId === null
      ? null
      : typeof input.flowId === "bigint"
        ? input.flowId.toString()
        : String(input.flowId);
  if (flowId !== null && !FLOW_ID_PATTERN.test(flowId)) return { ok: false, reason: "invalid-input" };

  const record: DeploymentRecoveryRecord = {
    version: RECOVERY_RECORD_VERSION,
    account: asValidated(input.account.toLowerCase()),
    chainId: input.chainId,
    contractAddress: asValidated(input.contractAddress.toLowerCase()),
    transactionHash: asValidated(transactionHash),
    phase: input.phase,
    flowId,
    createdAt: Date.now(),
  };

  try {
    storage.setItem(DEPLOYMENT_RECOVERY_STORAGE_KEY, JSON.stringify(record));
    return { ok: true };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}

/**
 * Read the recovery record for the current scope.
 *
 * Statuses:
 *  - "restored": a valid record matching this account/chain/contract exists —
 *    the caller MUST treat the deployment journey as unresolved.
 *  - "none": no record, or a record for a DIFFERENT scope (preserved, never
 *    deleted here — another wallet's evidence is not ours to discard).
 *  - "invalid": a record exists but fails validation — preserved untouched and
 *    ignored; the caller must not treat this as "no unresolved outcome".
 *  - "unavailable": storage could not be read — fail safe, same rule as above.
 */
export function loadDeploymentRecoveryRecord(
  storage: KeyValueStorage | null,
  scope: DeploymentRecoveryScope,
): LoadDeploymentRecoveryResult {
  if (!storage) return { status: "unavailable" };
  let raw: string | null;
  try {
    raw = storage.getItem(DEPLOYMENT_RECOVERY_STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "none" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid" };
  }
  if (!isValidRecoveryRecord(parsed)) return { status: "invalid" };
  if (!scopeMatches(parsed, scope)) return { status: "none" };

  return { status: "restored", record: parsed };
}

/**
 * Explicit-acknowledgment-only removal. The record is deleted ONLY when a
 * valid record exists for the exact current scope; records for other scopes,
 * unreadable storage, or malformed records are preserved. Callers must have
 * already explained that acknowledgment does not prove the transaction failed.
 */
export function clearDeploymentRecoveryRecord(
  storage: KeyValueStorage | null,
  scope: DeploymentRecoveryScope,
): ClearDeploymentRecoveryResult {
  if (!storage) return { ok: false, reason: "unavailable" };
  let load: LoadDeploymentRecoveryResult;
  try {
    load = loadDeploymentRecoveryRecord(storage, scope);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (load.status !== "restored") {
    // Nothing to clear for this scope (or unreadable) — preserve everything.
    return { ok: false, reason: "scope-mismatch" };
  }
  try {
    storage.removeItem(DEPLOYMENT_RECOVERY_STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
