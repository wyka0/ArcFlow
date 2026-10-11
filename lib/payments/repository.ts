import type { ConfirmedPayment } from "@/types";

import { parseConfirmedPayments } from "./records";
import {
  createBrowserStorage,
  InMemoryStorage,
  LOCAL_BROWSER_PERSISTENCE,
  PAYMENT_STORAGE_KEY,
  type KeyValueStorage,
  type PersistenceDescriptor,
} from "./storage";

/**
 * The payment repository.
 *
 * It owns persistence: nothing above it reads or writes storage directly. It
 * only ever stores records that pass `isValidConfirmedPayment` (confirmed +
 * real tx hash + supported Arc chain), so fake or unsettled payments cannot
 * enter the ledger.
 *
 * Every method is failure-tolerant: storage errors never propagate to the UI.
 */
export interface PaymentHistoryRepository {
  readonly persistence: PersistenceDescriptor;
  load(): readonly ConfirmedPayment[];
  save(record: ConfirmedPayment): void;
  saveMany(records: readonly ConfirmedPayment[]): void;
  clear(): void;
}

export function createPaymentRepository(storage: KeyValueStorage): PaymentHistoryRepository {
  function readAll(): ConfirmedPayment[] {
    try {
      const raw = storage.getItem(PAYMENT_STORAGE_KEY);
      if (!raw) return [];
      return parseConfirmedPayments(JSON.parse(raw) as unknown);
    } catch {
      return [];
    }
  }

  function writeAll(records: readonly ConfirmedPayment[]): void {
    try {
      storage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Storage full or blocked — the in-memory ledger still works this session.
    }
  }

  return {
    persistence: LOCAL_BROWSER_PERSISTENCE,

    load(): readonly ConfirmedPayment[] {
      return readAll();
    },

    save(record: ConfirmedPayment): void {
      this.saveMany([record]);
    },

    saveMany(records: readonly ConfirmedPayment[]): void {
      const existing = readAll();
      const seenIds = new Set(existing.map((entry) => entry.id.toLowerCase()));
      const seenHashes = new Set(existing.map((entry) => entry.txHash.toLowerCase()));

      const merged = [...existing];
      for (const record of parseConfirmedPayments(records)) {
        const id = record.id.toLowerCase();
        const hash = record.txHash.toLowerCase();
        if (seenIds.has(id) || seenHashes.has(hash)) continue;
        seenIds.add(id);
        seenHashes.add(hash);
        merged.push(record);
      }

      if (merged.length !== existing.length) {
        writeAll(merged);
      }
    },

    clear(): void {
      try {
        storage.removeItem(PAYMENT_STORAGE_KEY);
      } catch {
        // Ignore.
      }
    },
  };
}

let repositorySingleton: PaymentHistoryRepository | null = null;

/**
 * Returns the process-wide repository.
 *
 * Falls back to in-memory storage during SSR or when browser storage is
 * unavailable, so the app always has a working (if non-persistent) repository.
 */
export function getPaymentRepository(): PaymentHistoryRepository {
  if (!repositorySingleton) {
    repositorySingleton = createPaymentRepository(createBrowserStorage() ?? new InMemoryStorage());
  }
  return repositorySingleton;
}
