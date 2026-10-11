import { getAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AUTH_MESSAGE_DISCLAIMER,
  AUTH_MESSAGE_HEADER,
  buildAuthMessage,
  checkResourceOwnership,
  createInMemoryAuthSessionRepository,
  createInMemoryChallengeStore,
  createSessionForWallet,
  generateNonce,
  generateSessionId,
  getAuthenticatedWallet,
  getChallengeStore,
  getSessionFromRequest,
  hasDurableAuth,
  isEvmAddress,
  isProduction,
  readSessionIdFromCookieHeader,
  requireAuthenticatedSession,
  sanitiseSession,
  serializeClearSessionCookie,
  serializeSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  setAuthSessionRepositoryForTesting,
  setChallengeStoreForTesting,
  verifyAuthSignature,
  walletOwns,
} from "@/lib/auth";

const WALLET_A = "0xAbC1234567890aBcD1234567890abcD123456789" as Address;
const WALLET_B = "0x9999CCCC3333BBBBAAAAFFFF11110000DDDD2222" as Address;
const ORIGIN = "https://app.agentpay.example";

function newRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://app.agentpay.example/api/auth/session", {
    method: "GET",
    headers: { ...headers },
  });
}

describe("nonce generator", () => {
  it("produces 0x-prefixed 32-byte hex strings", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("never returns the same value twice", () => {
    const set = new Set<string>();
    for (let i = 0; i < 64; i += 1) set.add(generateNonce());
    expect(set.size).toBe(64);
  });

  it("is not derivable from the wallet address or the current time", () => {
    // Spot-check that two nonces generated in the same tick for the same
    // wallet are unrelated. A buggy implementation that used `Date.now()` or
    // the wallet as a seed would produce collisions.
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });
});

describe("auth message builder", () => {
  it("includes the wallet address and the disclaimer", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expires = new Date("2026-01-01T00:05:00.000Z");
    const message = buildAuthMessage({
      walletAddress: WALLET_A,
      nonce: "0xdeadbeef",
      issuedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      origin: ORIGIN,
      challengeId: "chg_test1234",
    });

    expect(message).toContain(AUTH_MESSAGE_HEADER);
    expect(message).toContain("It does NOT authorize a blockchain transaction");
    expect(message).toContain("It does NOT transfer funds");
    expect(message).toContain(WALLET_A);
    expect(message).toContain(ORIGIN);
    expect(message).toContain("0xdeadbeef");
  });

  it("documents the canonical disclaimer wording", () => {
    expect(AUTH_MESSAGE_DISCLAIMER).toContain("does not authorize a blockchain transaction");
  });
});

describe("isEvmAddress", () => {
  it("accepts valid EIP-55 checksums", () => {
    expect(isEvmAddress(WALLET_A)).toBe(true);
  });

  it("accepts all-lowercase addresses", () => {
    expect(isEvmAddress(WALLET_A.toLowerCase())).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isEvmAddress("0xnothex")).toBe(false);
    expect(isEvmAddress("")).toBe(false);
    expect(isEvmAddress(null)).toBe(false);
    expect(isEvmAddress(undefined)).toBe(false);
    expect(isEvmAddress(42)).toBe(false);
  });
});

describe("challenge store", () => {
  it("creates challenges with a random id and nonce", () => {
    const store = createInMemoryChallengeStore();
    const a = store.create({ walletAddress: WALLET_A, origin: ORIGIN });
    const b = store.create({ walletAddress: WALLET_A, origin: ORIGIN });
    expect(a.id).not.toBe(b.id);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.walletAddress).toBe(WALLET_A);
  });

  it("expires challenges after the TTL", () => {
    const store = createInMemoryChallengeStore();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const challenge = store.create({ walletAddress: WALLET_A, origin: ORIGIN, now: t0, ttlMs: 1000 });
    // Just past TTL:
    const consumed = store.consume(challenge.id, WALLET_A, new Date(t0.getTime() + 1500));
    expect(consumed).toBeNull();
  });

  it("is single-use: second consume returns null", () => {
    const store = createInMemoryChallengeStore();
    const challenge = store.create({ walletAddress: WALLET_A, origin: ORIGIN });
    expect(store.consume(challenge.id, WALLET_A)).not.toBeNull();
    expect(store.consume(challenge.id, WALLET_A)).toBeNull();
  });

  it("rejects consumption for the wrong wallet", () => {
    const store = createInMemoryChallengeStore();
    const challenge = store.create({ walletAddress: WALLET_A, origin: ORIGIN });
    expect(store.consume(challenge.id, WALLET_B)).toBeNull();
  });
});

describe("signature verification", () => {
  // A known test private key. Safe to commit; never used in production.
  const account = privateKeyToAccount(`0x${"a".repeat(64)}` as `0x${string}`);

  it("accepts a valid signature for the expected wallet", async () => {
    const message = buildAuthMessage({
      walletAddress: account.address,
      nonce: "0xabc",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      origin: ORIGIN,
      challengeId: "chg_test5678",
    });
    const signature = await account.signMessage({ message });
    const result = await verifyAuthSignature({
      message,
      signature,
      expectedWallet: account.address,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signer.toLowerCase()).toBe(account.address.toLowerCase());
    }
  });

  it("rejects an empty signature", async () => {
    const result = await verifyAuthSignature({
      message: "hello",
      signature: "",
      expectedWallet: account.address,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-hex signature", async () => {
    const result = await verifyAuthSignature({
      message: "hello",
      signature: "not-hex",
      expectedWallet: account.address,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a signature from a different wallet", async () => {
    const other = privateKeyToAccount(`0x${"b".repeat(64)}` as `0x${string}`);
    const message = "Sign in to AgentPay\nWallet: " + other.address;
    const signature = await other.signMessage({ message });
    const result = await verifyAuthSignature({
      message,
      signature,
      expectedWallet: account.address, // expecting A, signed by B
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("WRONG_SIGNER");
  });

  it("rejects a malformed wallet", async () => {
    const result = await verifyAuthSignature({
      message: "hello",
      signature: "0x" + "00".repeat(65),
      expectedWallet: "0xnothex" as Address,
    });
    expect(result.ok).toBe(false);
  });
});

describe("session repository (in-memory)", () => {
  let repo: ReturnType<typeof createInMemoryAuthSessionRepository>;
  beforeEach(() => {
    repo = createInMemoryAuthSessionRepository();
  });

  it("returns null for unknown ids", async () => {
    expect(await repo.findById("missing")).toBeNull();
  });

  it("stores and retrieves a session by id", async () => {
    const session = {
      id: "sess_abc",
      walletAddress: getAddress(WALLET_A),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await repo.create(session);
    const found = await repo.findById("sess_abc");
    expect(found?.walletAddress.toLowerCase()).toBe(WALLET_A.toLowerCase());
  });

  it("treats expired sessions as missing", async () => {
    const session = {
      id: "sess_old",
      walletAddress: getAddress(WALLET_A),
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    await repo.create(session);
    expect(await repo.findById("sess_old")).toBeNull();
  });

  it("revokes a session by id", async () => {
    const session = {
      id: "sess_to_revoke",
      walletAddress: getAddress(WALLET_A),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await repo.create(session);
    expect(await repo.revoke("sess_to_revoke")).toBe(true);
    expect(await repo.findById("sess_to_revoke")).toBeNull();
  });

  it("finds the most recent active session for a wallet", async () => {
    await repo.create({
      id: "sess_old_a",
      walletAddress: getAddress(WALLET_A),
      createdAt: new Date(Date.now() - 30_000).toISOString(),
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    });
    await repo.create({
      id: "sess_new_a",
      walletAddress: getAddress(WALLET_A),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const found = await repo.findByWallet(getAddress(WALLET_A));
    expect(found?.id).toBe("sess_new_a");
  });
});

describe("cookie helpers", () => {
  it("builds a Set-Cookie header that is HttpOnly and SameSite=Lax", () => {
    const cookie = serializeSessionCookie("sess_abc", false);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=sess_abc`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    // Non-production must NOT set Secure
    expect(cookie).not.toContain("Secure");
  });

  it("sets Secure in production", () => {
    const cookie = serializeSessionCookie("sess_abc", true);
    expect(cookie).toContain("Secure");
  });

  it("sets a clear cookie that expires immediately", () => {
    const clear = serializeClearSessionCookie(false);
    expect(clear).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(clear).toContain("Max-Age=0");
  });

  it("parses the session id out of a Cookie header", () => {
    expect(
      readSessionIdFromCookieHeader(`${SESSION_COOKIE_NAME}=sess_abc; foo=bar`),
    ).toBe("sess_abc");
    expect(readSessionIdFromCookieHeader("foo=bar; baz=qux")).toBeNull();
    expect(readSessionIdFromCookieHeader(null)).toBeNull();
  });
});

describe("session id generator", () => {
  it("produces unique opaque ids", () => {
    const set = new Set<string>();
    for (let i = 0; i < 32; i += 1) set.add(generateSessionId());
    expect(set.size).toBe(32);
    for (const id of set) {
      expect(id).toMatch(/^sess_[0-9a-f]{48}$/);
    }
  });
});

describe("session lifecycle (helpers)", () => {
  beforeEach(() => {
    setAuthSessionRepositoryForTesting(createInMemoryAuthSessionRepository());
  });
  afterEach(() => {
    setAuthSessionRepositoryForTesting(null);
  });

  it("requireAuthenticatedSession returns missing when no cookie", async () => {
    const result = await requireAuthenticatedSession(newRequest());
    expect(result.kind).toBe("missing");
    if (result.kind === "missing") expect(result.reason).toBe("no_cookie");
  });

  it("requireAuthenticatedSession returns missing for unknown cookie", async () => {
    const result = await requireAuthenticatedSession(
      newRequest({ cookie: `${SESSION_COOKIE_NAME}=nope` }),
    );
    expect(result.kind).toBe("missing");
  });

  it("creates, reads, and revokes a session", async () => {
    const { session } = await createSessionForWallet(getAddress(WALLET_A));
    const request = newRequest({ cookie: `${SESSION_COOKIE_NAME}=${session.id}` });
    const fromCookie = await getSessionFromRequest(request);
    expect(fromCookie?.id).toBe(session.id);

    const required = await requireAuthenticatedSession(request);
    expect(required.kind).toBe("ok");

    const wallet = await getAuthenticatedWallet(request);
    expect(wallet?.toLowerCase()).toBe(WALLET_A.toLowerCase());
  });

  it("rejects revoked sessions", async () => {
    const { session } = await createSessionForWallet(getAddress(WALLET_A));
    const repo = await (await import("@/lib/auth")).getAuthSessionRepository();
    await repo.revoke(session.id);
    const required = await requireAuthenticatedSession(
      newRequest({ cookie: `${SESSION_COOKIE_NAME}=${session.id}` }),
    );
    expect(required.kind).toBe("missing");
  });
});

describe("sanitiseSession", () => {
  it("returns the public fields, never the session id or cookie", () => {
    const sanitised = sanitiseSession({
      id: "sess_abc",
      walletAddress: getAddress(WALLET_A),
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T12:00:00.000Z",
    });
    expect(sanitised).toEqual({
      authenticated: true,
      walletAddress: getAddress(WALLET_A),
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T12:00:00.000Z",
    });
    // The session id must never appear in the public shape.
    expect(JSON.stringify(sanitised)).not.toContain("sess_abc");
  });
});

describe("ownership helpers", () => {
  it("walletOwns: anonymous resources are owned by everyone", () => {
    expect(walletOwns(getAddress(WALLET_A), null)).toBe(true);
    expect(walletOwns(null, null)).toBe(true);
  });

  it("walletOwns: owned resources are only owned by the matching wallet", () => {
    expect(walletOwns(getAddress(WALLET_A), getAddress(WALLET_A))).toBe(true);
    expect(walletOwns(getAddress(WALLET_A), getAddress(WALLET_A).toLowerCase() as Address)).toBe(true);
    expect(walletOwns(getAddress(WALLET_A), getAddress(WALLET_B))).toBe(false);
  });

  it("walletOwns: unauthenticated caller cannot access owned resource", () => {
    expect(walletOwns(null, getAddress(WALLET_A))).toBe(false);
  });

  it("checkResourceOwnership: anonymous + anonymous session is allowed", () => {
    const result = checkResourceOwnership(null, { kind: "missing", reason: "no_cookie" });
    expect(result.ok).toBe(true);
  });

  it("checkResourceOwnership: anonymous + authenticated session returns wallet", () => {
    const result = checkResourceOwnership(null, {
      kind: "ok",
      session: {
        id: "sess_abc",
        walletAddress: getAddress(WALLET_A),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.wallet?.toLowerCase()).toBe(WALLET_A.toLowerCase());
  });

  it("checkResourceOwnership: owned + missing session is 401", () => {
    const result = checkResourceOwnership(getAddress(WALLET_A), { kind: "missing", reason: "no_cookie" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe("UNAUTHENTICATED");
    }
  });

  it("checkResourceOwnership: owned + wrong session is 403", () => {
    const result = checkResourceOwnership(getAddress(WALLET_A), {
      kind: "ok",
      session: {
        id: "sess_abc",
        walletAddress: getAddress(WALLET_B),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("FORBIDDEN");
    }
  });
});

describe("isProduction / hasDurableAuth", () => {
  it("reflects the current NODE_ENV", () => {
    const before = process.env.NODE_ENV;
    // NODE_ENV is typed as read-only on the NodeJS.ProcessEnv interface,
    // but the runtime allows mutation. Cast to a mutable alias to assert
    // the observable behavior of `isProduction`.
    const env = process.env as { NODE_ENV?: string };
    env.NODE_ENV = "production";
    expect(isProduction()).toBe(true);
    env.NODE_ENV = "test";
    expect(isProduction()).toBe(false);
    env.NODE_ENV = before;
  });

  it("reports durable auth when DATABASE_URL is set", () => {
    const before = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgres://x";
      expect(hasDurableAuth()).toBe(true);
    } finally {
      process.env.DATABASE_URL = before;
    }
  });
});

describe("challenge store factory + setChallengeStoreForTesting", () => {
  afterEach(() => setChallengeStoreForTesting(null));

  it("returns a singleton store by default", () => {
    const a = getChallengeStore();
    const b = getChallengeStore();
    expect(a).toBe(b);
  });

  it("honours the test seam override", () => {
    const injected = createInMemoryChallengeStore();
    setChallengeStoreForTesting(injected);
    expect(getChallengeStore()).toBe(injected);
  });
});

describe("SESSION_TTL_SECONDS", () => {
  it("is a positive finite value (12h)", () => {
    expect(SESSION_TTL_SECONDS).toBe(12 * 60 * 60);
  });
});
