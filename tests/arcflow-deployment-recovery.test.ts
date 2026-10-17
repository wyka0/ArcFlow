/**
 * Phase 48.4 — durable unknown-outcome recovery (finding F1) regression tests.
 *
 * Uses the project's `InMemoryStorage` fake (lib/payments/storage.ts) plus a
 * throwing fake for unavailable-storage paths. All addresses are lowercase-
 * normalized by the module under test; records are scoped to account + chain
 * + contract, and evidence is never deleted except by the explicit clear.
 */
import { describe, expect, it } from "vitest";

import {
  clearDeploymentRecoveryRecord,
  DEPLOYMENT_RECOVERY_STORAGE_KEY,
  loadDeploymentRecoveryRecord,
  saveDeploymentRecoveryRecord,
} from "@/lib/arcflow/deployment-recovery";
import { canBeginDeployment } from "@/lib/arcflow/deploy-flow";
import { InMemoryStorage } from "@/lib/payments/storage";

const ACCOUNT = "0x9999999999999999999999999999999999999999";
const CONTRACT = "0x3fb50a2adc5fcba60274edb976e12dcad6fdb8c2"; // lowercase (normalized form)
const CHAIN_ID = 5042;
const TX_HASH = "0x" + "c".repeat(64);

const SCOPE = { account: ACCOUNT, chainId: CHAIN_ID, contractAddress: CONTRACT };

function makeStorage(): InMemoryStorage {
  return new InMemoryStorage();
}

function saveValid(storage: InMemoryStorage, overrides: Record<string, unknown> = {}) {
  return saveDeploymentRecoveryRecord(storage, {
    account: SCOPE.account,
    chainId: SCOPE.chainId,
    contractAddress: SCOPE.contractAddress,
    transactionHash: TX_HASH,
    phase: "execute",
    flowId: 7n,
    ...overrides,
  });
}

describe("saveDeploymentRecoveryRecord — round-trip and validation", () => {
  it("persists a valid record that loads back with normalized addresses", () => {
    const storage = makeStorage();
    // Mixed-case inputs must be normalized on save.
    const saved = saveDeploymentRecoveryRecord(storage, {
      account: "0x9999999999999999999999999999999999999999".toUpperCase().replace("0X", "0x"),
      chainId: CHAIN_ID,
      contractAddress: "0x3FB50A2ADC5FCBA60274EDB976E12DCAD6FDB8C2",
      transactionHash: TX_HASH.toUpperCase().replace("0X", "0x"),
      phase: "execute",
      flowId: 7n,
    });
    expect(saved).toEqual({ ok: true });

    const load = loadDeploymentRecoveryRecord(storage, SCOPE);
    expect(load.status).toBe("restored");
    if (load.status !== "restored") return;
    expect(load.record.account).toBe(ACCOUNT.toLowerCase());
    expect(load.record.contractAddress).toBe(CONTRACT);
    expect(load.record.transactionHash).toBe(TX_HASH.toLowerCase());
    expect(load.record.phase).toBe("execute");
    expect(load.record.flowId).toBe("7");
    expect(load.record.version).toBe(1);
    expect(typeof load.record.createdAt).toBe("number");
  });

  it("accepts a string flow id and null flow id", () => {
    const storage = makeStorage();
    expect(saveDeploymentRecoveryRecord(storage, {
      account: SCOPE.account, chainId: CHAIN_ID, contractAddress: SCOPE.contractAddress,
      transactionHash: TX_HASH, phase: "activate", flowId: "12",
    }).ok).toBe(true);
    expect(saveDeploymentRecoveryRecord(storage, {
      account: SCOPE.account, chainId: CHAIN_ID, contractAddress: SCOPE.contractAddress,
      transactionHash: TX_HASH, phase: "create", flowId: null,
    }).ok).toBe(true);
  });

  it("rejects invalid inputs without writing anything", () => {
    const storage = makeStorage();
    const base = {
      chainId: CHAIN_ID, contractAddress: SCOPE.contractAddress,
      transactionHash: TX_HASH, phase: "execute" as const, flowId: null,
    };
    expect(saveDeploymentRecoveryRecord(storage, { ...base, account: null }).ok).toBe(false);
    expect(saveDeploymentRecoveryRecord(storage, { ...base, account: "0x1234" }).ok).toBe(false);
    expect(saveDeploymentRecoveryRecord(storage, { ...base, account: SCOPE.account, chainId: 1 }).ok).toBe(false);
    expect(saveDeploymentRecoveryRecord(storage, { ...base, account: SCOPE.account, contractAddress: null }).ok).toBe(false);
    expect(saveDeploymentRecoveryRecord(storage, { ...base, account: SCOPE.account, transactionHash: "0x1234" }).ok).toBe(false);
    expect(saveDeploymentRecoveryRecord(storage, { ...base, account: SCOPE.account, phase: "complete" as never }).ok).toBe(false);
    expect(saveDeploymentRecoveryRecord(storage, { ...base, account: SCOPE.account, flowId: "0x5" }).ok).toBe(false);
    expect(storage.getItem(DEPLOYMENT_RECOVERY_STORAGE_KEY)).toBeNull();
  });
});

describe("loadDeploymentRecoveryRecord — scope and fail-safe handling", () => {
  it("restores a record scoped to the same account, chain, and contract", () => {
    const storage = makeStorage();
    saveValid(storage);
    const load = loadDeploymentRecoveryRecord(storage, SCOPE);
    expect(load.status).toBe("restored");
  });

  it("does not restore (and preserves) a record for a different account", () => {
    const storage = makeStorage();
    saveValid(storage);
    const load = loadDeploymentRecoveryRecord(storage, {
      ...SCOPE,
      account: "0x8888888888888888888888888888888888888888",
    });
    expect(load.status).toBe("none");
    // Evidence for the other wallet is preserved, never silently discarded.
    expect(storage.getItem(DEPLOYMENT_RECOVERY_STORAGE_KEY)).not.toBeNull();
  });

  it("does not restore a record scoped to a different chain", () => {
    const storage = makeStorage();
    saveValid(storage);
    const load = loadDeploymentRecoveryRecord(storage, { ...SCOPE, chainId: 5042002 });
    expect(load.status).toBe("none");
    expect(storage.getItem(DEPLOYMENT_RECOVERY_STORAGE_KEY)).not.toBeNull();
  });

  it("does not restore a record scoped to a different contract", () => {
    const storage = makeStorage();
    saveValid(storage);
    const load = loadDeploymentRecoveryRecord(storage, {
      ...SCOPE,
      contractAddress: "0x4444444444444444444444444444444444444444",
    });
    expect(load.status).toBe("none");
    expect(storage.getItem(DEPLOYMENT_RECOVERY_STORAGE_KEY)).not.toBeNull();
  });

  it("does not restore when the wallet scope is unknown (no account)", () => {
    const storage = makeStorage();
    saveValid(storage);
    expect(loadDeploymentRecoveryRecord(storage, { ...SCOPE, account: null }).status).toBe("none");
  });

  it("reports invalid (and preserves) a malformed or wrong-version record", () => {
    const storage = makeStorage();
    storage.setItem(DEPLOYMENT_RECOVERY_STORAGE_KEY, "{not json");
    expect(loadDeploymentRecoveryRecord(storage, SCOPE).status).toBe("invalid");

    const wrongVersion = JSON.stringify({ ...validRecordJson(), version: 2 });
    storage.setItem(DEPLOYMENT_RECOVERY_STORAGE_KEY, wrongVersion);
    expect(loadDeploymentRecoveryRecord(storage, SCOPE).status).toBe("invalid");

    const badHash = JSON.stringify({ ...validRecordJson(), transactionHash: "0x1234" });
    storage.setItem(DEPLOYMENT_RECOVERY_STORAGE_KEY, badHash);
    expect(loadDeploymentRecoveryRecord(storage, SCOPE).status).toBe("invalid");

    const badPhase = JSON.stringify({ ...validRecordJson(), phase: "complete" });
    storage.setItem(DEPLOYMENT_RECOVERY_STORAGE_KEY, badPhase);
    expect(loadDeploymentRecoveryRecord(storage, SCOPE).status).toBe("invalid");

    const missingField = JSON.stringify({ version: 1, account: ACCOUNT });
    storage.setItem(DEPLOYMENT_RECOVERY_STORAGE_KEY, missingField);
    expect(loadDeploymentRecoveryRecord(storage, SCOPE).status).toBe("invalid");

    // Invalid records are preserved untouched — never deleted on read.
    expect(storage.getItem(DEPLOYMENT_RECOVERY_STORAGE_KEY)).toBe(missingField);
  });

  it("returns none for empty storage", () => {
    const storage = makeStorage();
    expect(loadDeploymentRecoveryRecord(storage, SCOPE).status).toBe("none");
  });
});

describe("unavailable storage — fail safe, never clears a block", () => {
  class ThrowingStorage extends InMemoryStorage {
    getItem(): string | null {
      throw new Error("storage blocked");
    }
    setItem(): void {
      throw new Error("storage blocked");
    }
    removeItem(): void {
      throw new Error("storage blocked");
    }
  }

  it("save reports write-failed and writes nothing", () => {
    const storage = new ThrowingStorage();
    const saved = saveDeploymentRecoveryRecord(storage, {
      account: SCOPE.account, chainId: CHAIN_ID, contractAddress: SCOPE.contractAddress,
      transactionHash: TX_HASH, phase: "execute", flowId: null,
    });
    // The storage adapter exists but the write fails — fail-safe either way:
    // nothing is persisted, so nothing can weaken the in-session block.
    expect(saved).toEqual({ ok: false, reason: "write-failed" });
  });

  it("load reports unavailable — callers must not treat it as 'no unresolved outcome'", () => {
    const storage = new ThrowingStorage();
    expect(loadDeploymentRecoveryRecord(storage, SCOPE).status).toBe("unavailable");
  });

  it("clear reports not-ok — the evidence is never lost to a storage error", () => {
    const storage = new ThrowingStorage();
    const cleared = clearDeploymentRecoveryRecord(storage, SCOPE);
    expect(cleared.ok).toBe(false);
  });

  it("null storage behaves like unavailable storage", () => {
    expect(saveDeploymentRecoveryRecord(null, {
      account: SCOPE.account, chainId: CHAIN_ID, contractAddress: SCOPE.contractAddress,
      transactionHash: TX_HASH, phase: "execute", flowId: null,
    })).toEqual({ ok: false, reason: "unavailable" });
    expect(loadDeploymentRecoveryRecord(null, SCOPE).status).toBe("unavailable");
    expect(clearDeploymentRecoveryRecord(null, SCOPE).ok).toBe(false);
  });
});

describe("clearDeploymentRecoveryRecord — explicit acknowledgment only", () => {
  it("removes a matching-scope record", () => {
    const storage = makeStorage();
    saveValid(storage);
    expect(clearDeploymentRecoveryRecord(storage, SCOPE)).toEqual({ ok: true });
    expect(loadDeploymentRecoveryRecord(storage, SCOPE).status).toBe("none");
    expect(storage.getItem(DEPLOYMENT_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it("preserves a record belonging to a different scope", () => {
    const storage = makeStorage();
    saveValid(storage);
    const cleared = clearDeploymentRecoveryRecord(storage, {
      ...SCOPE,
      account: "0x8888888888888888888888888888888888888888",
    });
    expect(cleared.ok).toBe(false);
    expect(cleared).toEqual({ ok: false, reason: "scope-mismatch" });
    expect(storage.getItem(DEPLOYMENT_RECOVERY_STORAGE_KEY)).not.toBeNull();
  });

  it("preserves an invalid record (not ours to interpret or delete)", () => {
    const storage = makeStorage();
    storage.setItem(DEPLOYMENT_RECOVERY_STORAGE_KEY, "{corrupt");
    expect(clearDeploymentRecoveryRecord(storage, SCOPE).ok).toBe(false);
    expect(storage.getItem(DEPLOYMENT_RECOVERY_STORAGE_KEY)).toBe("{corrupt");
  });
});

describe("restored record blocks resubmission via the deployment gate", () => {
  it("a restored unknown outcome feeds canBeginDeployment as blocked", () => {
    const storage = makeStorage();
    saveValid(storage);
    const load = loadDeploymentRecoveryRecord(storage, SCOPE);
    if (load.status !== "restored") throw new Error("expected restored");
    const unresolved = { transactionHash: load.record.transactionHash, phase: load.record.phase };
    expect(
      canBeginDeployment({ inFlight: false, unresolvedUnknown: unresolved }),
    ).toEqual({ ok: false, reason: "unresolved-unknown" });
    // Acknowledgment clears the record, and the gate opens again.
    expect(clearDeploymentRecoveryRecord(storage, SCOPE)).toEqual({ ok: true });
    expect(
      canBeginDeployment({ inFlight: false, unresolvedUnknown: null }),
    ).toEqual({ ok: true });
  });
});

/** A minimal valid record payload (as persisted JSON) for mutation tests. */
function validRecordJson(): Record<string, unknown> {
  return {
    version: 1,
    account: ACCOUNT,
    chainId: CHAIN_ID,
    contractAddress: CONTRACT,
    transactionHash: TX_HASH,
    phase: "execute",
    flowId: "7",
    createdAt: 1_700_000_000_000,
  } as unknown as Record<string, unknown>;
}
