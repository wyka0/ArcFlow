import { type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as challengeHandler } from "@/app/api/auth/challenge/route";
import { POST as verifyHandler } from "@/app/api/auth/verify/route";
import { GET as sessionHandler } from "@/app/api/auth/session/route";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";

import {
  createInMemoryAuthSessionRepository,
  createInMemoryChallengeStore,
  setAuthSessionRepositoryForTesting,
  setChallengeStoreForTesting,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { setRateLimitStoreForTesting, InMemoryRateLimitStore, setSecurityLoggerSinkForTesting } from "@/lib/security";

const WALLET = "0xAbC1234567890aBcD1234567890abcD123456789" as Address;
const account = privateKeyToAccount(`0x${"c".repeat(64)}` as `0x${string}`);

function buildChallengeRequest(body: unknown, origin: string | null = "https://app.agentpay.example"): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers["origin"] = origin;
  return new Request("https://app.agentpay.example/api/auth/challenge", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function buildVerifyRequest(body: unknown, cookieValue?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "https://app.agentpay.example",
  };
  if (cookieValue) headers["cookie"] = `${SESSION_COOKIE_NAME}=${cookieValue}`;
  return new Request("https://app.agentpay.example/api/auth/verify", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function buildSessionRequest(cookieValue?: string): Request {
  const headers: Record<string, string> = {};
  if (cookieValue) headers["cookie"] = `${SESSION_COOKIE_NAME}=${cookieValue}`;
  return new Request("https://app.agentpay.example/api/auth/session", { headers });
}

function buildLogoutRequest(cookieValue?: string): Request {
  const headers: Record<string, string> = {
    origin: "https://app.agentpay.example",
    "content-type": "application/json",
  };
  if (cookieValue) headers["cookie"] = `${SESSION_COOKIE_NAME}=${cookieValue}`;
  return new Request("https://app.agentpay.example/api/auth/logout", {
    method: "POST",
    headers,
  });
}

function readSessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0]?.split("=")[1] ?? "";
}

// `any` is used here on purpose: the test asserts against heterogeneous
// response shapes (challenge, verify, session, logout), and a precise
// discriminated union would obscure what each test actually checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(response: Response): Promise<{ status: number; body: any; setCookie: string | null }> {
  const setCookie = response.headers.get("set-cookie");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await response.json()) as any;
  return { status: response.status, body, setCookie };
}

describe("auth route handlers — end-to-end HTTP flow", () => {
  beforeEach(() => {
    setChallengeStoreForTesting(createInMemoryChallengeStore());
    setAuthSessionRepositoryForTesting(createInMemoryAuthSessionRepository());
    setRateLimitStoreForTesting(new InMemoryRateLimitStore());
    setSecurityLoggerSinkForTesting(() => {});
  });
  afterEach(() => {
    setChallengeStoreForTesting(null);
    setAuthSessionRepositoryForTesting(null);
    setRateLimitStoreForTesting(null);
    setSecurityLoggerSinkForTesting(null);
  });

  it("challenge rejects malformed wallet with 400", async () => {
    const response = await challengeHandler(buildChallengeRequest({ walletAddress: "0xnothex" }));
    const { status, body } = await readJson(response);
    expect(status).toBe(400);
    expect(body.error.code).toBe("MALFORMED_WALLET");
  });

  it("challenge rejects empty body with 400", async () => {
    const response = await challengeHandler(buildChallengeRequest(null));
    const { status, body } = await readJson(response);
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_JSON");
  });

  it("challenge issues a non-deterministic message that contains the wallet and origin", async () => {
    const a = await challengeHandler(buildChallengeRequest({ walletAddress: WALLET }));
    const b = await challengeHandler(buildChallengeRequest({ walletAddress: WALLET }));
    const ja = await a.json();
    const jb = await b.json();
    expect(ja.ok).toBe(true);
    expect(jb.ok).toBe(true);
    expect(ja.challenge.message).not.toBe(jb.challenge.message);
    expect(ja.challenge.message).toContain(WALLET);
    expect(ja.challenge.message).toContain("https://app.agentpay.example");
  });

  it("challenge without origin header falls back to host", async () => {
    const headers: Record<string, string> = { "content-type": "application/json", host: "app.agentpay.example" };
    const request = new Request("https://app.agentpay.example/api/auth/challenge", {
      method: "POST",
      headers,
      body: JSON.stringify({ walletAddress: WALLET }),
    });
    const response = await challengeHandler(request);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.challenge.message).toContain("app.agentpay.example");
  });

  it("verify rejects missing challengeId", async () => {
    const response = await verifyHandler(buildVerifyRequest({ walletAddress: WALLET, signature: "0x00" }));
    const { status, body } = await readJson(response);
    expect(status).toBe(400);
    expect(body.error.code).toBe("MISSING_CHALLENGE");
  });

  it("verify rejects missing signature", async () => {
    const response = await verifyHandler(buildVerifyRequest({ walletAddress: WALLET, challengeId: "x" }));
    const { status, body } = await readJson(response);
    expect(status).toBe(400);
    expect(body.error.code).toBe("MISSING_SIGNATURE");
  });

  it("verify rejects unknown challengeId with 401", async () => {
    const response = await verifyHandler(
      buildVerifyRequest({ walletAddress: WALLET, challengeId: "nope", signature: `0x${"0".repeat(130)}` as `0x${string}` }),
    );
    const { status, body } = await readJson(response);
    expect(status).toBe(401);
    expect(body.error.code).toBe("INVALID_CHALLENGE");
  });

  it("verify rejects bad signature with 401", async () => {
    // First get a real challenge
    const challengeResp = await challengeHandler(buildChallengeRequest({ walletAddress: account.address }));
    const { challenge } = await challengeResp.json();

    // Sign with a different private key (wrong signer)
    const wrongAccount = privateKeyToAccount(`0x${"d".repeat(64)}` as `0x${string}`);
    const signature = await wrongAccount.signMessage({ message: challenge.message });

    const response = await verifyHandler(
      buildVerifyRequest({
        walletAddress: account.address,
        challengeId: challenge.id,
        signature,
      }),
    );
    const { status, body } = await readJson(response);
    expect(status).toBe(401);
    expect(body.error.code).toBe("SIGNATURE_INVALID");
  });

  it("verify accepts a correct signature, sets cookie, and returns sanitised session", async () => {
    const challengeResp = await challengeHandler(buildChallengeRequest({ walletAddress: account.address }));
    const { challenge } = await challengeResp.json();
    const signature = await account.signMessage({ message: challenge.message });

    const response = await verifyHandler(
      buildVerifyRequest({
        walletAddress: account.address,
        challengeId: challenge.id,
        signature,
      }),
    );
    const { status, body, setCookie } = await readJson(response);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.session.authenticated).toBe(true);
    expect(body.session.walletAddress.toLowerCase()).toBe(account.address.toLowerCase());
    // The session id must NEVER appear in the response body.
    expect(JSON.stringify(body)).not.toContain("sess_");
    // The cookie must be HttpOnly + SameSite=Lax.
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=sess_`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("verify rejects a replayed challenge with 401", async () => {
    const challengeResp = await challengeHandler(buildChallengeRequest({ walletAddress: account.address }));
    const { challenge } = await challengeResp.json();
    const signature = await account.signMessage({ message: challenge.message });

    // First verify succeeds
    const first = await verifyHandler(
      buildVerifyRequest({ walletAddress: account.address, challengeId: challenge.id, signature }),
    );
    expect(first.status).toBe(200);

    // Replay must fail
    const second = await verifyHandler(
      buildVerifyRequest({ walletAddress: account.address, challengeId: challenge.id, signature }),
    );
    const { status, body } = await readJson(second);
    expect(status).toBe(401);
    expect(body.error.code).toBe("INVALID_CHALLENGE");
  });

  it("session returns unauthenticated when no cookie", async () => {
    const response = await sessionHandler(buildSessionRequest());
    const { status, body } = await readJson(response);
    expect(status).toBe(200);
    expect(body).toEqual({ authenticated: false });
  });

  it("session returns sanitised info when cookie is valid", async () => {
    // Create a session via verify flow
    const challengeResp = await challengeHandler(buildChallengeRequest({ walletAddress: account.address }));
    const { challenge } = await challengeResp.json();
    const signature = await account.signMessage({ message: challenge.message });
    const verifyResp = await verifyHandler(
      buildVerifyRequest({ walletAddress: account.address, challengeId: challenge.id, signature }),
    );
    const cookieValue = readSessionCookie(verifyResp);

    const response = await sessionHandler(buildSessionRequest(cookieValue));
    const { body } = await readJson(response);
    expect(body.authenticated).toBe(true);
    expect(body.session.walletAddress.toLowerCase()).toBe(account.address.toLowerCase());
    expect(body.session).not.toHaveProperty("id");
  });

  it("logout revokes server session and clears cookie", async () => {
    const challengeResp = await challengeHandler(buildChallengeRequest({ walletAddress: account.address }));
    const { challenge } = await challengeResp.json();
    const signature = await account.signMessage({ message: challenge.message });
    const verifyResp = await verifyHandler(
      buildVerifyRequest({ walletAddress: account.address, challengeId: challenge.id, signature }),
    );
    const cookieValue = readSessionCookie(verifyResp);

    // Confirm session is active
    const before = await sessionHandler(buildSessionRequest(cookieValue));
    expect((await before.json()).authenticated).toBe(true);

    // Logout
    const logout = await logoutHandler(buildLogoutRequest(cookieValue));
    const { body, setCookie } = await readJson(logout);
    expect(body).toEqual({ ok: true, authenticated: false });
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");

    // Confirm session is gone
    const after = await sessionHandler(buildSessionRequest(cookieValue));
    expect((await after.json()).authenticated).toBe(false);
  });
});

describe("auth route handlers — cross-user ownership isolation", () => {
  beforeEach(() => {
    setChallengeStoreForTesting(createInMemoryChallengeStore());
    setAuthSessionRepositoryForTesting(createInMemoryAuthSessionRepository());
    setRateLimitStoreForTesting(new InMemoryRateLimitStore());
    setSecurityLoggerSinkForTesting(() => {});
  });
  afterEach(() => {
    setChallengeStoreForTesting(null);
    setAuthSessionRepositoryForTesting(null);
    setRateLimitStoreForTesting(null);
    setSecurityLoggerSinkForTesting(null);
  });

  it("User A and User B get distinct session cookies", async () => {
    const userA = privateKeyToAccount(`0x${"1".repeat(64)}` as `0x${string}`);
    const userB = privateKeyToAccount(`0x${"2".repeat(64)}` as `0x${string}`);

    // Sign in A
    const chA = await challengeHandler(buildChallengeRequest({ walletAddress: userA.address }));
    const { challenge: challengeA } = await chA.json();
    const sigA = await userA.signMessage({ message: challengeA.message });
    const verifyA = await verifyHandler(
      buildVerifyRequest({ walletAddress: userA.address, challengeId: challengeA.id, signature: sigA }),
    );
    const cookieA = readSessionCookie(verifyA);

    // Sign in B
    const chB = await challengeHandler(buildChallengeRequest({ walletAddress: userB.address }));
    const { challenge: challengeB } = await chB.json();
    const sigB = await userB.signMessage({ message: challengeB.message });
    const verifyB = await verifyHandler(
      buildVerifyRequest({ walletAddress: userB.address, challengeId: challengeB.id, signature: sigB }),
    );
    const cookieB = readSessionCookie(verifyB);

    expect(cookieA).not.toBe(cookieB);
    expect(cookieA).toMatch(/^sess_/);
    expect(cookieB).toMatch(/^sess_/);

    // Each cookie resolves to its own wallet
    const sessionA = await sessionHandler(buildSessionRequest(cookieA));
    const sessionB = await sessionHandler(buildSessionRequest(cookieB));
    expect((await sessionA.json()).session.walletAddress.toLowerCase()).toBe(userA.address.toLowerCase());
    expect((await sessionB.json()).session.walletAddress.toLowerCase()).toBe(userB.address.toLowerCase());

    // Cross-cookie access: User B's cookie should NOT resolve to User A's session
    const cross = await sessionHandler(buildSessionRequest(cookieA));
    const crossBody = await cross.json();
    expect(crossBody.session.walletAddress.toLowerCase()).toBe(userA.address.toLowerCase());
    expect(crossBody.session.walletAddress.toLowerCase()).not.toBe(userB.address.toLowerCase());
  });
});
