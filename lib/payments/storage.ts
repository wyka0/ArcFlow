/**
 * Low-level key/value storage adapters.
 *
 * This module is the only place that touches `window.localStorage`. Everything
 * above it (repository, store, providers, UI) works against the `KeyValueStorage`
 * interface, so persistence can later be swapped for a server-side implementation
 * without touching the rest of the app.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PAYMENT_STORAGE_KEY = "agentpay.payments.confirmed.v1";

export interface PersistenceDescriptor {
  kind: "local-browser" | "server";
  /** Whether the store can be treated as a trusted enforcement boundary. */
  trusted: boolean;
  label: string;
  note: string;
}

/**
 * Browser-local persistence.
 *
 * NOT a security boundary: any client can edit localStorage. It provides
 * continuity across reloads for the demo only. Enforcing spending limits against
 * a malicious client requires a trusted server/agent execution boundary.
 */
export const LOCAL_BROWSER_PERSISTENCE: PersistenceDescriptor = {
  kind: "local-browser",
  trusted: false,
  label: "LOCAL PERSISTENCE",
  note: "Browser storage. Not tamper-proof and not a security boundary.",
};

/** Non-persistent fallback used during SSR or when storage is unavailable. */
export class InMemoryStorage implements KeyValueStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

/** Returns browser localStorage, or null when unavailable/blocked (e.g. SSR). */
export function createBrowserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === "undefined") return null;
    const probe = "__agentpay_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}
